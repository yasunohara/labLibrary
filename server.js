const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const { DatabaseSync } = require("node:sqlite");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "books.db");
const GOOGLE_BOOKS_API_KEY = process.env.GOOGLE_BOOKS_API_KEY || "";

const db = new DatabaseSync(DB_PATH);

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

ensureColumn("books", "publisher", "TEXT DEFAULT ''");
ensureColumn("books", "published_date", "TEXT DEFAULT ''");
ensureColumn("books", "purchase_date", "TEXT DEFAULT ''");
ensureColumn("books", "cover_url", "TEXT DEFAULT ''");

const selectBookByIsbn = db.prepare(`
  SELECT isbn, title, author, publisher, published_date, purchase_date, cover_url, created_at
  FROM books
  WHERE isbn = ?
`);

const selectAllBooks = db.prepare(`
  SELECT isbn, title, author, publisher, published_date, purchase_date, cover_url, created_at
  FROM books
  ORDER BY created_at DESC, title ASC
`);

const insertBook = db.prepare(`
  INSERT INTO books (isbn, title, author, publisher, published_date, purchase_date, cover_url)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const updateBook = db.prepare(`
  UPDATE books
  SET title = ?, author = ?, publisher = ?, published_date = ?, purchase_date = ?, cover_url = ?
  WHERE isbn = ?
`);

const deleteBook = db.prepare(`
  DELETE FROM books
  WHERE isbn = ?
`);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon"
};

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = columns.some((column) => column.name === columnName);

  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

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

function isValidIsbn(isbn) {
  return /^(?:\d{10}|\d{13}|\d{9}X)$/.test(isbn);
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

function defaultPurchaseDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function getBooksPage({ page, pageSize, scope, query }) {
  const allowedScopes = new Set(["title", "author", "isbn"]);
  const safeScope = allowedScopes.has(scope) ? scope : "title";
  const safeQuery = String(query || "").trim();

  const whereClause = safeQuery ? `WHERE ${safeScope} LIKE ? ESCAPE '\\'` : "";
  const pattern = safeQuery
    ? `%${safeQuery.replace(/([%_\\])/g, "\\$1")}%`
    : null;
  const offset = (page - 1) * pageSize;

  const countSql = `SELECT COUNT(*) AS total FROM books ${whereClause}`;
  const listSql = `
    SELECT isbn, title, author, publisher, published_date, purchase_date, cover_url, created_at
    FROM books
    ${whereClause}
    ORDER BY created_at DESC, title ASC
    LIMIT ? OFFSET ?
  `;

  const totalRow = pattern
    ? db.prepare(countSql).get(pattern)
    : db.prepare(countSql).get();
  const total = Number(totalRow?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const normalizedPage = Math.min(page, totalPages);
  const normalizedOffset = (normalizedPage - 1) * pageSize;

  const books = pattern
    ? db.prepare(listSql).all(pattern, pageSize, normalizedOffset)
    : db.prepare(listSql).all(pageSize, normalizedOffset);

  return {
    books,
    pagination: {
      page: normalizedPage,
      pageSize,
      total,
      totalPages,
      hasPrev: normalizedPage > 1,
      hasNext: normalizedPage < totalPages
    },
    filter: {
      scope: safeScope,
      query: safeQuery
    }
  };
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let rawBody = "";

    request.on("data", (chunk) => {
      rawBody += chunk;
      if (rawBody.length > 1_000_000) {
        request.destroy();
        reject(new Error("Request body is too large."));
      }
    });

    request.on("end", () => {
      if (!rawBody) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });

    request.on("error", reject);
  });
}

function serveStaticFile(requestPath, response) {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const absolutePath = path.normalize(path.join(PUBLIC_DIR, safePath));

  if (!absolutePath.startsWith(PUBLIC_DIR)) {
    sendJson(response, 403, { error: "Forbidden." });
    return;
  }

  fs.readFile(absolutePath, (error, data) => {
    if (error) {
      sendJson(response, 404, { error: "Not found." });
      return;
    }

    const ext = path.extname(absolutePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream"
    });
    response.end(data);
  });
}

async function fetchBookMetadataByIsbn(isbn) {
  const endpoint = new URL("https://www.googleapis.com/books/v1/volumes");
  endpoint.searchParams.set("q", `isbn:${isbn}`);
  endpoint.searchParams.set("maxResults", "1");
  endpoint.searchParams.set("printType", "books");
  endpoint.searchParams.set("projection", "full");

  if (GOOGLE_BOOKS_API_KEY) {
    endpoint.searchParams.set("key", GOOGLE_BOOKS_API_KEY);
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const apiResponse = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        "User-Agent": "library-checker/1.0"
      }
    });

    if (apiResponse.ok) {
      const data = await apiResponse.json();
      const volume = data.items?.[0];

      if (!volume?.volumeInfo) {
        return null;
      }

      const { volumeInfo } = volume;
      const imageLinks = volumeInfo.imageLinks || {};
      const coverUrl = normalizeImageUrl(
        imageLinks.thumbnail ||
          imageLinks.smallThumbnail ||
          imageLinks.small ||
          imageLinks.medium ||
          imageLinks.large ||
          imageLinks.extraLarge
      );

      return {
        isbn,
        title: volumeInfo.title || "",
        author: Array.isArray(volumeInfo.authors) ? volumeInfo.authors.join(", ") : "",
        publisher: volumeInfo.publisher || "",
        coverUrl,
        publishedDate: normalizeStoredDate(volumeInfo.publishedDate),
        description: volumeInfo.description || "",
        infoLink: volumeInfo.infoLink || "",
        source: "google-books"
      };
    }

    if (![429, 500, 502, 503, 504].includes(apiResponse.status) || attempt === 2) {
      throw new Error(`Google Books API error: ${apiResponse.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }

  return null;
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/books") {
    const hasPagingParams =
      url.searchParams.has("page") ||
      url.searchParams.has("pageSize") ||
      url.searchParams.has("scope") ||
      url.searchParams.has("query");

    if (!hasPagingParams) {
      const books = selectAllBooks.all();
      sendJson(response, 200, { books });
      return;
    }

    const page = parsePositiveInt(url.searchParams.get("page"), 1);
    const pageSize = Math.min(parsePositiveInt(url.searchParams.get("pageSize"), 40), 100);
    const scope = String(url.searchParams.get("scope") || "title");
    const query = String(url.searchParams.get("query") || "");

    const paged = getBooksPage({ page, pageSize, scope, query });
    sendJson(response, 200, paged);
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/books/")) {
    const isbn = normalizeIsbn(url.pathname.split("/").pop());

    if (!isValidIsbn(isbn)) {
      sendJson(response, 400, { error: "ISBNが不正です。" });
      return;
    }

    const book = selectBookByIsbn.get(isbn);
    if (!book) {
      sendJson(response, 404, { error: "対象の本が見つかりません。" });
      return;
    }

    sendJson(response, 200, { book });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/check") {
    const isbn = normalizeIsbn(url.searchParams.get("isbn"));

    if (!isValidIsbn(isbn)) {
      sendJson(response, 400, { error: "ISBN-10 または ISBN-13 を入力してください。" });
      return;
    }

    const book = selectBookByIsbn.get(isbn);
    sendJson(response, 200, { owned: Boolean(book), book: book || null });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/book-info") {
    const isbn = normalizeIsbn(url.searchParams.get("isbn"));

    if (!isValidIsbn(isbn)) {
      sendJson(response, 400, { error: "ISBN-10 または ISBN-13 を入力してください。" });
      return;
    }

    try {
      const book = await fetchBookMetadataByIsbn(isbn);

      if (!book) {
        sendJson(response, 404, { error: "Google Books で該当する本が見つかりませんでした。" });
        return;
      }

      sendJson(response, 200, {
        book,
        apiKeyConfigured: Boolean(GOOGLE_BOOKS_API_KEY)
      });
    } catch (error) {
      sendJson(response, 502, {
        error: "Google Books から情報を取得できませんでした。",
        details: error.message
      });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/books") {
    const body = await readRequestBody(request);
    const isbn = normalizeIsbn(body.isbn);
    const title = String(body.title || "").trim();
    const author = String(body.author || "").trim();
    const publisher = String(body.publisher || "").trim();
    const publishedDate = normalizeStoredDate(body.publishedDate);
    const purchaseDate = normalizeStoredDate(body.purchaseDate) || defaultPurchaseDate();
    const coverUrl = normalizeImageUrl(body.coverUrl);
    const overwrite = Boolean(body.overwrite);

    if (!isValidIsbn(isbn)) {
      sendJson(response, 400, { error: "ISBN-10 または ISBN-13 を入力してください。" });
      return;
    }

    if (!title) {
      sendJson(response, 400, { error: "タイトルを入力してください。" });
      return;
    }

    const existingBook = selectBookByIsbn.get(isbn);
    if (existingBook) {
      if (!overwrite) {
        sendJson(response, 409, {
          error: "このISBNの本はすでに登録されています。上書きしますか？",
          existingBook
        });
        return;
      }

      updateBook.run(title, author, publisher, publishedDate, purchaseDate, coverUrl, isbn);
      const book = selectBookByIsbn.get(isbn);
      sendJson(response, 200, { message: "登録済みの本を更新しました。", book });
      return;
    }

    insertBook.run(isbn, title, author, publisher, publishedDate, purchaseDate, coverUrl);
    const book = selectBookByIsbn.get(isbn);
    sendJson(response, 201, { message: "本を登録しました。", book });
    return;
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/api/books/")) {
    const isbn = normalizeIsbn(url.pathname.split("/").pop());

    if (!isValidIsbn(isbn)) {
      sendJson(response, 400, { error: "削除対象のISBNが不正です。" });
      return;
    }

    const result = deleteBook.run(isbn);
    if (result.changes === 0) {
      sendJson(response, 404, { error: "対象の本が見つかりません。" });
      return;
    }

    sendJson(response, 200, { message: "本を削除しました。" });
    return;
  }

  sendJson(response, 404, { error: "API endpoint not found." });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    serveStaticFile(url.pathname, response);
  } catch (error) {
    const statusCode = error.message === "Invalid JSON body." ? 400 : 500;
    sendJson(response, statusCode, {
      error: statusCode === 400 ? error.message : "Internal server error."
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Library app is running at http://${HOST}:${PORT}`);
  console.log(`SQLite DB: ${DB_PATH}`);

  if (!GOOGLE_BOOKS_API_KEY) {
    console.log("GOOGLE_BOOKS_API_KEY is not set. Google Books lookup may be rate-limited.");
  }
});
