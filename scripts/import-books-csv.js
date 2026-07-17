const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const csvPath = process.argv[2] || "書籍.csv";
const dbPath = process.argv[3] || process.env.DB_PATH || path.join(__dirname, "..", "books.db");
const googleBooksApiKey = process.env.GOOGLE_BOOKS_API_KEY || "";

function normalizeIsbn(value) {
  return String(value || "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

function normalizeImageUrl(url) {
  const value = String(url || "").trim();
  if (!value) {
    return "";
  }

  if (value.startsWith("http://")) {
    return `https://${value.slice("http://".length)}`;
  }

  if (value.startsWith("//")) {
    return `https:${value}`;
  }

  return value;
}

function normalizeStoredDate(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  if (/^\d{4}-\d{2}$/.test(text)) {
    return `${text}-01`;
  }

  if (/^\d{4}$/.test(text)) {
    return `${text}-01-01`;
  }

  return "";
}

function isValidIsbn(isbn) {
  return /^(?:\d{10}|\d{13}|\d{9}X)$/.test(isbn);
}

function purchaseDateFromFiscalYear(value) {
  const year = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isFinite(year) || year < 0) {
    return "";
  }

  return `${String(year + 1).padStart(4, "0")}-03-31`;
}

function parseCsv(text) {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.slice(1).map((line, index) => {
    const [purchaseYear, isbn] = line.split(",").map((value) => value.trim());
    return {
      rowNumber: index + 2,
      purchaseYear,
      purchaseDate: purchaseDateFromFiscalYear(purchaseYear),
      isbn: normalizeIsbn(isbn)
    };
  });
}

async function fetchBookMetadataByIsbn(isbn) {
  const endpoint = new URL("https://www.googleapis.com/books/v1/volumes");
  endpoint.searchParams.set("q", `isbn:${isbn}`);
  endpoint.searchParams.set("maxResults", "1");
  endpoint.searchParams.set("printType", "books");
  endpoint.searchParams.set("projection", "full");

  if (googleBooksApiKey) {
    endpoint.searchParams.set("key", googleBooksApiKey);
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        "User-Agent": "library-checker/1.0"
      }
    });

    if (response.ok) {
      const data = await response.json();
      const volumeInfo = data.items?.[0]?.volumeInfo;
      if (!volumeInfo) {
        return null;
      }

      const imageLinks = volumeInfo.imageLinks || {};
      return {
        title: volumeInfo.title || "",
        author: Array.isArray(volumeInfo.authors) ? volumeInfo.authors.join(", ") : "",
        publisher: volumeInfo.publisher || "",
        publishedDate: normalizeStoredDate(volumeInfo.publishedDate),
        coverUrl: normalizeImageUrl(
          imageLinks.thumbnail ||
            imageLinks.smallThumbnail ||
            imageLinks.small ||
            imageLinks.medium ||
            imageLinks.large ||
            imageLinks.extraLarge
        )
      };
    }

    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) {
      throw new Error(`Google Books API error: ${response.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }

  return null;
}

function ensureColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = columns.some((column) => column.name === columnName);
  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

async function main() {
  const absoluteCsvPath = path.resolve(csvPath);
  const absoluteDbPath = path.resolve(dbPath);
  const rows = parseCsv(fs.readFileSync(absoluteCsvPath, "utf8"));
  const db = new DatabaseSync(absoluteDbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS books (
      isbn TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT DEFAULT '',
      publisher TEXT DEFAULT '',
      published_date TEXT DEFAULT '',
      purchase_date TEXT DEFAULT '',
      cover_url TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  ensureColumn(db, "books", "publisher", "TEXT DEFAULT ''");
  ensureColumn(db, "books", "published_date", "TEXT DEFAULT ''");
  ensureColumn(db, "books", "purchase_date", "TEXT DEFAULT ''");
  ensureColumn(db, "books", "cover_url", "TEXT DEFAULT ''");

  const selectBookByIsbn = db.prepare("SELECT isbn FROM books WHERE isbn = ?");
  const insertBook = db.prepare(`
    INSERT INTO books (isbn, title, author, publisher, published_date, purchase_date, cover_url)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = {
    csv: absoluteCsvPath,
    db: absoluteDbPath,
    total: rows.length,
    imported: 0,
    skipped: 0,
    failed: 0,
    failures: []
  };

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    process.stdout.write(`\r${index + 1}/${rows.length} ${row.isbn || "(no isbn)"}       `);

    try {
      if (!isValidIsbn(row.isbn)) {
        throw new Error("Invalid ISBN");
      }

      if (!row.purchaseDate) {
        throw new Error("Invalid purchase year");
      }

      if (selectBookByIsbn.get(row.isbn)) {
        result.skipped += 1;
        continue;
      }

      const metadata = await fetchBookMetadataByIsbn(row.isbn);
      if (!metadata?.title) {
        throw new Error("Metadata not found");
      }

      insertBook.run(
        row.isbn,
        metadata.title,
        metadata.author,
        metadata.publisher,
        metadata.publishedDate,
        row.purchaseDate,
        metadata.coverUrl
      );
      result.imported += 1;
      await new Promise((resolve) => setTimeout(resolve, 150));
    } catch (error) {
      result.failed += 1;
      result.failures.push({
        rowNumber: row.rowNumber,
        isbn: row.isbn,
        reason: error.message
      });
    }
  }

  process.stdout.write("\n");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
