# Windows startup scripts

このフォルダには、Windows 環境で初回セットアップと普段の起動を簡単にするための batch ファイルがあります。

## 初回のみ

```bat
startup\setup.bat
```

実行内容:

- `discord-bot\.env` と `ai-service\.env` を `.env.example` から作成します。
- `discord-bot` の npm 依存関係をインストールし、TypeScript をビルドします。
- `ai-service\.venv` を作成し、Python 依存関係をインストールします。
- `data` フォルダを作成します。

実行後、必ず `discord-bot\.env` を編集して `DISCORD_TOKEN` と `CLIENT_ID` を設定してください。

## スラッシュコマンド登録

Bot にコマンド候補が出ない場合は、`discord-bot\.env` に `DISCORD_TOKEN` と `CLIENT_ID` を設定した後で次を実行してください。

```bat
startup\deploy-commands.bat
```

OAuth2 URL Generator で `applications.commands` scope を付けずに招待した場合、サーバー側でコマンド候補が表示されません。開発中にすぐ反映したい場合は `GUILD_ID` に対象サーバー ID を設定してから実行してください。

## 毎回の起動

```bat
startup\start-bot.bat
```

実行内容:

- AI Service を別ウィンドウで起動します。
- AI Service の `/health` が正常になるまで待ってから Discord Bot を別ウィンドウで起動します。
- どちらのウィンドウも Bot 利用中は閉じないでください。


## 起動時の挙動

`start-bot.bat` は AI Service を起動した後、設定されたポートの `/health` を最大 60 秒間確認します。AI Service が正常になるまでは Discord Bot を起動しないため、固定秒数待ちより安全です。

補足: `start-bot.bat` 実行時に `.env` や `ai-service\.venv` が存在しない場合は、自動で `startup\setup.bat` を呼び出して初期セットアップを試みます。ただし、初回セットアップ後は `discord-bot\.env` に `DISCORD_TOKEN` と `CLIENT_ID` を設定してください。


## AI Service のポート変更

`AI_SERVICE_URL=http://localhost:8004` のように Bot 側の接続先を変更する場合は、`ai-service\.env` にも同じポートを設定してください。

```env
AI_SERVICE_PORT=8004
```

`start-bot.bat` は `ai-service\.env` の `AI_SERVICE_PORT` を読み取り、そのポートで AI Service を起動し、同じポートの `/health` を確認します。

## 前提

### Node.js を変更した後に SQLite の起動エラーが出る場合

`NODE_MODULE_VERSION` の不一致は、依存関係をインストールしたときと起動時の Node.js が異なる場合に発生します。Node.js 22 を推奨します。セットアップと起動には同じ Node.js を使用してください。

Node.js 24 を使う場合は、対応する Windows 用バイナリを提供する `better-sqlite3` 12 系が必要です。本リポジトリでは 12.11.1 以降を使用します。古い 11 系が残っている場合は、最新版のコードを取得してから `discord-bot` で `npm install` を実行してください。`npm rebuild` だけでは依存バージョンは更新されません。

`npm start` と `npm run dev` は、起動前に SQLite の読み込みを確認し、失敗した場合は `npm rebuild better-sqlite3` を実行します。再ビルドに失敗する場合は、Node.js 22 に切り替えて新しいターミナルを開き、次を実行してください。DB と `.env` の削除は不要です。

```bat
cd discord-bot
node --version
npm install
npm run build
npm start
```

Node.js 24 を使用し続ける場合は、ネイティブ依存関係のビルドに Python と Visual Studio C++ Build Tools が必要になる場合があります。

- Windows
- Node.js 20+
- Python 3.11+
- npm

DINOv2 モデルは初回実行時に Hugging Face から取得されるため、初回のみ時間がかかります。

## Linux セットアップ（Ubuntu 24.04 / Debian 12）

Bash、Python 3.11～3.12、Node.js 22 または24を使用します。Python 3.13以降は現在固定している PyTorch 2.3.1 の対象外です。Linux x86_64 は CPU 版で検証しています。ARM64 はインストール経路を用意していますが、実機未検証です。

リポジトリのルートで実行します。別の作業ディレクトリからスクリプトの絶対パスを指定しても動作します。

```bash
# 初回: Ubuntu / Debian のシステムパッケージとローカル Node.js 22
bash startup/install-system.sh
# 以降の処理は root ではなく Bot を動かす通常ユーザーで実行
bash startup/setup.sh
```

`install-system.sh` は apt に必要なときだけ sudo を使用し、Node.js はシステム版を置き換えず `.tools/node` に配置します。公式配布ファイルの SHA-256 を検証します。既に必要な OS パッケージがある場合、Node.js だけの導入は `bash startup/install-system.sh --node-only` で実行できます。他のディストリビューションでは同等の OS パッケージを手動で導入してください。

`setup.sh` は既存の `.env` を保持し、未作成の場合だけサンプルから作成します。Python 仮想環境、Node.js 依存関係、ビルド、DINOv2 の取得と実推論まで実行します。モデル取得を後回しにする場合は `bash startup/setup.sh --skip-model-download` を使用できますが、画像登録・類似判定の初回実行時に取得が必要です。Python の指定例は `PYTHON_BIN=python3.11 bash startup/setup.sh` です。

Windows から移行するときはソース、`.env`、DB、画像を移し、`.venv` と `node_modules` はコピーせず Linux 上で作成してください。Windows の絶対パスを設定した `DATABASE_PATH`、`IMAGE_STORAGE_DIR`、`SPAM_IMAGE_IMPORT_DIR` などは Linux のパスへ変更してください。既存の仮想環境が Linux 用でない場合、スクリプトは削除せずエラーにします。

### 設定

`discord-bot/.env` に `DISCORD_TOKEN` と `CLIENT_ID` を設定してください。Message Content Intent も Discord Developer Portal で有効にしてください。トークン値を Git に登録しないでください。

`ADMIN_WEB_TOKEN` を使う場合、`ai-service/.env` と `discord-bot/.env` に同じ値を設定します。標準ポートは AI が8000、Bot 管理画面が3000です。変更する場合は、例えば次のように両方を合わせてください。

```dotenv
# ai-service/.env
AI_SERVICE_PORT=8004
```

```dotenv
# discord-bot/.env
AI_SERVICE_URL=http://127.0.0.1:8004
```

### 起動・停止

```bash
bash startup/start-bot.sh
# 別ターミナルで停止
bash startup/stop-bot.sh
```

起動時に Bot をビルドし直し、SQLite の互換性を確認します。AI サービスを先に起動して `/health` の応答を確認してから Bot を起動します。AI と Bot は同じスーパーバイザーで管理し、片方が終了したら残りも停止します。重複起動と既存 AI ポートの使用を検出します。PID はプロセス開始時刻も照合し、無関係なプロセスを停止しません。

既定ではバックグラウンドで起動し、起動コマンドが正常終了した後は SSH を切断しても継続します。標準入出力をターミナルから分離し、独立したセッションで管理します。起動失敗時は成功扱いにせず、エラーを返します。停止には `bash startup/stop-bot.sh` を使用してください。

ターミナル内で動作を確認したい場合は `bash startup/start-bot.sh --foreground` を使用します。このモードは Ctrl+C で両サービスを停止します。OS 再起動後の自動起動・異常終了後の自動再起動は含みません。

ログは `data/logs/ai-service.log`、`data/logs/discord-bot.log`、起動管理用の `data/logs/supervisor.log` です。Bot の Discord 接続成功は `discord-bot.log` の `bot ready` で確認してください。モデルキャッシュは `.hf-cache` です。自動ローテーションは含まれないため、長期運用ではログのローテーションを設定してください。

```bash
tail -f data/logs/ai-service.log data/logs/discord-bot.log
# Discord 認証情報なしで AI サービスのみを確認
bash startup/start-bot.sh --ai-only
# スラッシュコマンド登録（Discord 上のコマンド設定を更新）
bash startup/deploy-commands.sh
```

AI はローカルホストで待ち受けます。Bot 管理画面へリモートから接続する場合は、SSH トンネルまたは適切な HTTPS リバースプロキシを使用し、OAuth2 の `WEB_BASE_URL` と Redirect URL を一致させてください。
