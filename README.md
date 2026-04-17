# ISBN所蔵チェッカー

ISBNを入力して、その本を持っているかどうかをローカルで確認できるシンプルなWebアプリです。

## 特徴

- Node.js だけで起動可能
- ローカル SQLite データベース `books.db` を自動作成
- ISBN で所蔵確認
- Google Books API からタイトル、著者、出版社、表紙画像を取得して登録補助
- 同じ ISBN の本を再登録すると、確認後に上書き更新できる
- 登録済み一覧の表示と削除

## ローカル起動

```bash
node server.js
```

ブラウザで `http://127.0.0.1:3000` を開いて使います。

## Google Books API の設定

API キーを設定しておくと安定して利用しやすくなります。

PowerShell:

```powershell
$env:GOOGLE_BOOKS_API_KEY="あなたのAPIキー"
node server.js
```

Docker を使う場合は `compose.yaml` の `GOOGLE_BOOKS_API_KEY` を設定します。

`/api/book-info?isbn=...` では Google Books の `volumes?q=isbn:...` を使って検索しています。

## Docker での起動

このリポジトリには一般的な Docker / Compose 用のセットアップを含めています。

- `Dockerfile`
- `compose.yaml`
- `.dockerignore`

### 起動

```bash
docker compose up -d --build
```

ブラウザで `http://127.0.0.1:3000` を開いて使います。

### compose の内容

- アプリ本体: コンテナ内で `node server.js`
- 公開ポート: `3000`
- DB 保存先: コンテナ内 `/data/books.db`
- ホスト側保存先: `./data/books.db`

### NAS などで使う場合

- リバースプロキシでコンテナの `3000` 番へ転送
- 証明書管理で HTTPS を設定
- データベースは永続ボリュームに保存

## 補足

- ISBN は `978-...` のようにハイフン付きで入力しても内部で自動整形されます
- 既存 DB があっても、必要なら `publisher` カラムを自動追加します
- 既存 DB があっても、必要なら `cover_url` カラムを自動追加します
- `node:sqlite` は現状 Experimental Warning が出ますが、Node.js v24 では利用できます
