# Discord Image Spam Detection Bot

セルフホスト型の Discord 画像スパム検出 Bot です。Discord に投稿された画像を SHA-256、pHash、DINOv2 Small 埋め込み類似度で段階判定し、自動削除、ログ送信、管理者レビュー、既知スパム画像登録を行う構成を目指します。

## 1. 推奨アーキテクチャ

```mermaid
flowchart TD
  A[Discord Gateway / MESSAGE_CREATE] --> B[discord-bot Node.js]
  B -->|画像添付のみ処理| C[安全な画像ダウンロード]
  C --> D[SHA-256 / pHash 軽量判定]
  D -->|必要時のみ HTTP| E[ai-service FastAPI]
  E --> F[DINOv2 Small 特徴抽出]
  F --> G[SQLite Repository]
  G --> E
  E --> B
  B --> H[削除・ログ Embed・レビュー Button]
```

- Discord Bot は Gateway イベント処理を軽量に保ち、画像がないメッセージは即 return します。
- 初期実装は HTTP API 方式です。将来 BullMQ/Redis Worker へ差し替えやすいよう `services` と `repositories` を分離しています。
- AI 判定はローカル FastAPI サービスで実行し、OpenAI API / Google Cloud Vision / AWS Rekognition などの有料外部 AI API には依存しません。
- SQLite で単一サーバー起動できますが、Repository 層を差し替えることで PostgreSQL / pgvector / FAISS に移行可能です。

## 2. ディレクトリ構造

```text
discord-bot/        Discord Bot 本体 TypeScript / discord.js v14
ai-service/         FastAPI / PyTorch / DINOv2 Small 画像判定サービス
shared/schemas/     Bot と AI Service の JSON Schema
docs/               設計・運用ドキュメント
data/               SQLite DB と画像保存先（git ignore）
docker-compose.yml  Bot + AI Service 起動例
```

## 3. 使用ライブラリ

### Discord Bot

- Node.js 20+
- discord.js v14
- TypeScript
- undici: タイムアウト付き HTTP ダウンロード/API 呼び出し
- sharp: 画像メタデータ検証・正規化
- better-sqlite3: SQLite Repository
- lru-cache: 短期判定 Cache
- p-limit: 同時ダウンロード数制御
- pino: 構造化ログ

### AI Service

- Python 3.11+
- FastAPI / Uvicorn
- Pillow / imagehash: 画像検証と pHash
- PyTorch / Transformers: DINOv2 Small 特徴抽出
- numpy: Cosine Similarity
- pydantic-settings: 環境変数設定

## 4. DB スキーマ案

初期実装の SQLite スキーマは `discord-bot/src/repositories/schema.sql` と `ai-service/app/repositories/schema.sql` にあります。主要テーブルは以下です。

- `guild_settings`: Guild ごとのログチャンネル、自動削除、閾値、共有 DB 利用設定。
- `spam_images`: 既知スパム画像。SHA-256、pHash、DINOv2 embedding、カテゴリ、備考、active フラグを保持。
- `detection_events`: 投稿画像の判定結果、判定方式、類似度、削除有無など。
- `moderation_actions`: Button/管理操作の監査ログ。
- `false_positive_reports`: 誤検知の記録。

## 5. Discord Bot と AI Service 間の API 仕様

### `POST /v1/analyze`

`multipart/form-data`:

- `file`: 画像本体
- `guild_id`: Discord Guild ID
- `message_id`: Discord Message ID
- `sha256`: Bot 側で計算済み SHA-256（任意）
- `phash`: Bot 側で計算済み pHash（任意）

レスポンス例:

```json
{
  "is_spam": true,
  "action": "delete",
  "confidence_level": "high",
  "decision_method": "dinov2",
  "sha256_match": false,
  "phash_distance": 12,
  "ai_similarity": 0.9721,
  "matched_spam_image_id": 15
}
```

### `POST /v1/spam-images`

管理者が画像を既知スパム DB に登録します。登録時に SHA-256、pHash、DINOv2 embedding を一度だけ生成して保存します。

## 6. 判定フロー

1. `messageCreate` 受信。
2. Bot 自身、DM、画像添付なしは即 return。
3. Content-Type、拡張子、サイズを確認。
4. 同時ダウンロード数とタイムアウトを制限して画像を取得。
5. 実データを `sharp` で検証し、SHA-256 を計算。
6. 短期 Cache または SQLite で SHA-256 完全一致判定。
7. pHash が利用可能な場合は軽量近似判定。
8. 軽量判定で確定しない場合のみ AI Service へ送信。
9. 高信頼度は自動削除 + ログ。中間信頼度は設定に応じてレビュー。低信頼度は通過。
10. 管理者 Button 操作を権限確認後、監査ログに保存。

閾値は `.env` で変更できます。DINOv2 類似度は固定の正解値ではなく、実データ分布を見ながら調整してください。

## 7. Phase 1 の実装範囲

この初期実装では以下を含みます。

- Discord Bot 起動、画像添付検出、画像なし即 return。
- 安全な画像ダウンロード、サイズ/拡張子/MIME/画像デコード検証。
- SHA-256 計算、既知スパム画像 SHA 完全一致。
- AI Service HTTP 呼び出しと障害時 Fallback。
- 自動削除、ログ Embed、管理者確認 Button の土台。
- SQLite スキーマ、Repository 分離。
- FastAPI AI Service、pHash、DINOv2 embedding、類似度比較、登録 API。
- Docker Compose と `.env.example`。

## 8. 既存コードへ加える変更点

このリポジトリには実装済みアプリケーションコードがなかったため、新規に `discord-bot/`、`ai-service/`、`shared/`、`docs/` を追加しました。

## セットアップ

```bash
cp discord-bot/.env.example discord-bot/.env
cp ai-service/.env.example ai-service/.env
# .env に DISCORD_TOKEN、CLIENT_ID、必要なら GUILD_ID と MESSAGE_CONTENT_INTENT を設定
```

### Discord Developer Portal

- OAuth2 URL Generator の Scopes:
  - `bot`
  - `applications.commands`

- Bot Token は `.env` の `DISCORD_TOKEN` に設定し、コードへ直書きしないでください。
- Gateway Intent:
  - `Guilds`
  - `GuildMessages`
  - `MessageContent`: `MESSAGE_CONTENT_INTENT=true` にした場合のみ Bot が要求します。Discord Developer Portal 側で Message Content Intent を有効化していない状態で要求すると `Used disallowed intents` で起動に失敗します。添付画像や本文ログを安定して扱うには有効化を推奨しますが、大規模サーバーでは Privileged Intent 審査が必要になる可能性があります。
- 必要権限:
  - View Channels
  - Read Message History
  - Send Messages
  - Embed Links
  - Attach Files
  - Manage Messages
  - Use Application Commands

## 起動

### Docker Compose

```bash
docker compose up --build
```

### ローカル開発

```bash
cd ai-service
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

```bash
cd discord-bot
npm install
npm run build
npm start
```



### AI Service の初回応答時間

DINOv2 モデルの初回ロードや CPU 推論には時間がかかるため、Bot 側の AI Service HTTP timeout は `.env` で調整できます。`UND_ERR_HEADERS_TIMEOUT` が出る場合は、AI Service が処理中に Bot 側の待ち時間を超えています。

```env
AI_HEADERS_TIMEOUT_MS=180000
AI_BODY_TIMEOUT_MS=300000
```

### AI Service のポート変更

ローカル起動で AI Service を `8004` など別ポートにしたい場合は、`ai-service/.env` と `discord-bot/.env` を合わせてください。

```env
# ai-service/.env
AI_SERVICE_PORT=8004

# discord-bot/.env
AI_SERVICE_URL=http://localhost:8004
```

Docker Compose でホスト側公開ポートを変える場合は、Compose 実行時の環境変数 `AI_SERVICE_PORT=8004` を設定できます。コンテナ間通信では Bot は `http://ai-service:8000` を使います。

## スラッシュコマンド

- `/register-spam-image image [category] [notes]`: 管理者専用。`image` だけ必須で、カテゴリと備考は任意です。添付画像を AI Service へ送り、既知スパム画像として登録します。
- `/spam-log-channel set channel`: サーバーごとの画像スパム検知ログ送信先を設定します。
- `/spam-log-channel show`: 現在の画像スパム検知ログ送信先を表示します。
- `/spam-log-channel clear`: 画像スパム検知ログ送信先の設定を解除します。


## Windows startup scripts

Windows で初回セットアップと普段の起動を簡単にするため、`startup/` に batch ファイルを用意しています。

```bat
startup\setup.bat
startup\deploy-commands.bat
startup\start-bot.bat
```

初回は `setup.bat` を実行後、`discord-bot\.env` に `DISCORD_TOKEN` と `CLIENT_ID` を設定してください。その後、コマンド候補を表示するため `deploy-commands.bat` を実行してください。以後は基本的に `start-bot.bat` を起動すれば AI Service と Discord Bot が別ウィンドウで起動します。

## 既知の制限

- pHash 判定の Node.js 側実装は Phase 2 拡張用インターフェースのみで、初期の pHash 計算は AI Service が担当します。
- 大量画像時の本格的なキュー分離、Redis、FAISS/pgvector は将来 Phase 5/6 の拡張対象です。
- DINOv2 モデル初回起動時は Hugging Face からモデルを取得するためネットワークとディスク容量が必要です。運用時はモデルキャッシュを永続化してください。
