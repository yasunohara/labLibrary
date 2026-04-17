# ISBN所蔵チェッカー

ISBNを入力して、その本を持っているかどうかをローカルで確認できるシンプルなWebアプリです。

## 特徴

- Node.jsだけで起動可能
- ローカルSQLiteデータベース `books.db` を自動作成
- ISBNで所蔵確認
- Google Books APIからタイトル、著者、出版社、表紙画像を取得して登録補助
- 同じISBNの本を再登録すると、確認後に上書き更新できる
- 登録済み一覧の表示と削除

## 起動方法

```bash
node server.js
```

ブラウザで `http://127.0.0.1:3000` を開いて使います。

## Google Books APIの設定

Google Books APIの公開データ取得を使うため、APIキーを設定しておくと安定して利用しやすくなります。

PowerShell:

```powershell
$env:GOOGLE_BOOKS_API_KEY="あなたのAPIキー"
node server.js
```

`/api/book-info?isbn=...` では Google Books の `volumes?q=isbn:...` を使って検索しています。

## データ保存先

- データベース: `books.db`

## 補足

- ISBNは `978-...` のようにハイフン付きで入力しても内部で自動整形されます
- 既存DBがあっても、必要なら `publisher` カラムを自動追加します
- 既存DBがあっても、必要なら `cover_url` カラムを自動追加します
- `node:sqlite` は現状 Experimental Warning が出ますが、Node.js v24 では利用できます
