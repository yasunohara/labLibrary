const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const dbPath = process.argv[2] || process.env.DB_PATH || path.join(__dirname, "..", "books.db");

function isbn10ToIsbn13(isbn10) {
  const body = `978${String(isbn10).slice(0, 9)}`;
  let sum = 0;

  for (let index = 0; index < body.length; index += 1) {
    sum += Number(body[index]) * (index % 2 === 0 ? 1 : 3);
  }

  return `${body}${(10 - (sum % 10)) % 10}`;
}

function main() {
  const db = new DatabaseSync(path.resolve(dbPath));
  const rows = db.prepare("SELECT * FROM books WHERE length(isbn) = 10 ORDER BY isbn").all();
  const selectBookByIsbn = db.prepare("SELECT isbn FROM books WHERE isbn = ?");
  const updateIsbn = db.prepare("UPDATE books SET isbn = ? WHERE isbn = ?");
  const updateExistingBook = db.prepare(`
    UPDATE books
    SET title = ?,
        author = ?,
        publisher = ?,
        published_date = ?,
        purchase_date = ?,
        cover_url = ?
    WHERE isbn = ?
  `);
  const deleteBook = db.prepare("DELETE FROM books WHERE isbn = ?");

  const result = {
    db: path.resolve(dbPath),
    total: rows.length,
    converted: 0,
    merged: 0
  };

  db.exec("BEGIN");
  try {
    for (const row of rows) {
      const isbn13 = isbn10ToIsbn13(row.isbn);
      const existing = selectBookByIsbn.get(isbn13);

      if (existing) {
        updateExistingBook.run(
          row.title,
          row.author,
          row.publisher,
          row.published_date,
          row.purchase_date,
          row.cover_url,
          isbn13
        );
        deleteBook.run(row.isbn);
        result.merged += 1;
        continue;
      }

      updateIsbn.run(isbn13, row.isbn);
      result.converted += 1;
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  console.log(JSON.stringify(result, null, 2));
}

main();
