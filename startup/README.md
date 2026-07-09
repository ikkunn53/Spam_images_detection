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

`start-bot.bat` は AI Service を起動した後、`http://127.0.0.1:8000/health` を最大 60 秒間確認します。AI Service が正常になるまでは Discord Bot を起動しないため、固定秒数待ちより安全です。

補足: `start-bot.bat` 実行時に `.env` や `ai-service\.venv` が存在しない場合は、自動で `startup\setup.bat` を呼び出して初期セットアップを試みます。ただし、初回セットアップ後は `discord-bot\.env` に `DISCORD_TOKEN` と `CLIENT_ID` を設定してください。

## 前提

- Windows
- Node.js 20+
- Python 3.11+
- npm

DINOv2 モデルは初回実行時に Hugging Face から取得されるため、初回のみ時間がかかります。
