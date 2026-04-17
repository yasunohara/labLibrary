const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const { DatabaseSync } = require("node:sqlite");

const HOST = "127.0.0.1";
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DB_PATH = path.join(__dirname, "books.db");

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS books (
    isbn TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const selectBookByIsbn = db.prepare(`
  SELECT isbn, title, author, created_at
  FROM books
  WHERE isbn = ?
`);

const selectAllBooks = db.prepare(`
  SELECT isbn, title, author, created_at
  FROM books
  ORDER BY created_at DESC, title ASC
`);

const insertBook = db.prepare(`
  INSERT INTO books (isbn, title, author)
  VALUES (?, ?, ?)
  ON CONFLICT(isbn) DO UPDATE SET
    title = excluded.title,
    author = excluded.author
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

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function normalizeIsbn(value) {
  return String(value || "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

function isValidIsbn(isbn) {
  return /^(?:\d{10}|\d{13}|\d{9}X)$/.test(isbn);
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
      } catch (error) {
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

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/books") {
    const books = selectAllBooks.all();
    sendJson(response, 200, { books });
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

  if (request.method === "POST" && url.pathname === "/api/books") {
    const body = await readRequestBody(request);
    const isbn = normalizeIsbn(body.isbn);
    const title = String(body.title || "").trim();
    const author = String(body.author || "").trim();

    if (!isValidIsbn(isbn)) {
      sendJson(response, 400, { error: "ISBN-10 または ISBN-13 を入力してください。" });
      return;
    }

    if (!title) {
      sendJson(response, 400, { error: "タイトルを入力してください。" });
      return;
    }

    insertBook.run(isbn, title, author);
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
});
