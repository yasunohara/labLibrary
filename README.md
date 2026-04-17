# ISBNチェッカー

ISBN を使って本の所蔵を確認し、登録・一覧表示・更新・削除ができるローカル Web アプリです。Google Books API から書誌情報を取得して登録内容に反映できます。

## 主な機能

- ISBN で本を検索
- 未登録本は Google Books API から情報取得して登録
- 登録済み本は内容の更新・削除が可能
- 一覧表示は画像表示と表表示を切り替え可能
- タイトル・著者・ISBN で一覧を絞り込み可能
- 詳細ページで登録済み情報を確認可能

## ローカル起動

前提:

- Node.js

起動:

```bash
node server.js
```

ブラウザで `http://127.0.0.1:3000` を開いて使います。

## Google Books API の設定

このアプリは `process.env.GOOGLE_BOOKS_API_KEY` を参照します。`.env` からの読み込みにも対応しています。

`.env` の例:

```env
GOOGLE_BOOKS_API_KEY=your_api_key_here
```

## Docker での起動

このリポジトリには以下の Docker / Compose 用ファイルが含まれています。

- `Dockerfile`
- `compose.yaml`
- `.dockerignore`

起動:

```bash
docker compose up -d --build
```

ソースコードは `package.json`、`server.js`、`public/` をコンテナへ bind mount しているため、これらを編集した場合はイメージの再ビルドは不要です。通常はコンテナ再起動で反映できます。

```bash
docker compose restart
```

### Docker での Google Books API 設定

`compose.yaml` では `GOOGLE_BOOKS_API_KEY` を環境変数から受け取ります。

```yaml
GOOGLE_BOOKS_API_KEY: ${GOOGLE_BOOKS_API_KEY:-}
```

Docker で使う場合は、`compose.yaml` と同じディレクトリに `.env` ファイルを作成して設定します。

```env
GOOGLE_BOOKS_API_KEY=your_api_key_here
```

API キーを変更したあとに反映したい場合:

```bash
docker compose up -d --force-recreate
```

### compose の内容

- アプリ本体: コンテナ内で `node server.js`
- ソースコード: `package.json`、`server.js`、`public/` を `/app` に個別 bind mount
- 公開ポート: `3000`
- DB 保存先: コンテナ内 `/data/books.db`
- ホスト側保存先: `./data/books.db`

## 補足

- 実行時 DB は `DB_PATH` で切り替え可能です
- `.env` は `.gitignore` に含めています
- Google Books API の結果によっては出版社や表紙画像が空の場合があります
