const checkForm = document.getElementById("check-form");
const checkIsbnInput = document.getElementById("check-isbn");
const checkResult = document.getElementById("check-result");

const bookForm = document.getElementById("book-form");
const bookIsbnInput = document.getElementById("book-isbn");
const bookTitleInput = document.getElementById("book-title");
const bookAuthorInput = document.getElementById("book-author");
const bookPublisherInput = document.getElementById("book-publisher");
const bookCoverInput = document.getElementById("book-cover-url");
const coverPreview = document.getElementById("cover-preview");
const lookupButton = document.getElementById("lookup-button");
const lookupMessage = document.getElementById("lookup-message");

const formMessage = document.getElementById("form-message");
const bookList = document.getElementById("book-list");

function normalizeIsbn(value) {
  return String(value || "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setCheckResult(kind, message) {
  if (!checkResult) {
    return;
  }

  checkResult.className = `result-card ${kind}`;
  checkResult.textContent = message;
}

function setInlineMessage(target, message, isError = false) {
  if (!target) {
    return;
  }

  target.textContent = message;
  target.className = isError ? "inline-message error" : "inline-message success";
}

function clearInlineMessage(target) {
  if (!target) {
    return;
  }

  target.textContent = "";
  target.className = "inline-message";
}

function updateCoverPreview(url, title = "") {
  if (!coverPreview) {
    return;
  }

  const safeUrl = String(url || "").trim();

  if (!safeUrl) {
    coverPreview.className = "cover-preview empty";
    coverPreview.innerHTML = "<span>表紙プレビューはここに表示されます。</span>";
    return;
  }

  coverPreview.className = "cover-preview";
  coverPreview.innerHTML = `
    <img src="${escapeHtml(safeUrl)}" alt="${escapeHtml(title || "書影")}" loading="lazy" />
  `;
}

async function fetchBooks() {
  const response = await fetch("/api/books");
  const data = await response.json();
  renderBooks(data.books || []);
}

async function submitBook(payload) {
  const response = await fetch("/api/books", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  return { response, data };
}

function renderBooks(books) {
  if (!bookList) {
    return;
  }

  if (!books.length) {
    bookList.className = "book-list empty";
    bookList.textContent = "まだ本が登録されていません。";
    return;
  }

  bookList.className = "book-list";
  bookList.innerHTML = books
    .map((book) => {
      const cover = book.cover_url
        ? `<img class="book-cover" src="${escapeHtml(book.cover_url)}" alt="${escapeHtml(book.title)}" loading="lazy" />`
        : `<div class="book-cover placeholder">NO IMAGE</div>`;

      return `
        <article class="book-item">
          <div class="book-main">
            ${cover}
            <div class="book-meta">
              <h3>${escapeHtml(book.title)}</h3>
              <p>ISBN: ${escapeHtml(book.isbn)}</p>
              <p>著者: ${escapeHtml(book.author || "未登録")}</p>
              <p>出版社: ${escapeHtml(book.publisher || "未登録")}</p>
            </div>
          </div>
          <button class="delete-button" data-isbn="${escapeHtml(book.isbn)}">削除</button>
        </article>
      `;
    })
    .join("");
}

async function lookupBookByIsbn() {
  clearInlineMessage(lookupMessage);
  const isbn = normalizeIsbn(bookIsbnInput?.value);

  if (!isbn) {
    setInlineMessage(lookupMessage, "ISBNを入力してください。", true);
    return;
  }

  lookupButton.disabled = true;
  lookupButton.textContent = "取得中...";

  try {
    const response = await fetch(`/api/book-info?isbn=${encodeURIComponent(isbn)}`);
    const data = await response.json();

    if (!response.ok) {
      setInlineMessage(lookupMessage, data.error || "書誌情報の取得に失敗しました。", true);
      return;
    }

    bookTitleInput.value = data.book.title || "";
    bookAuthorInput.value = data.book.author || "";
    bookPublisherInput.value = data.book.publisher || "";
    bookCoverInput.value = data.book.coverUrl || "";
    updateCoverPreview(data.book.coverUrl, data.book.title);

    const apiKeyNote = data.apiKeyConfigured ? "" : " APIキー未設定のため、利用量が増えると制限される可能性があります。";
    setInlineMessage(lookupMessage, `Google Books から情報を取得しました。${apiKeyNote}`);
  } catch {
    setInlineMessage(lookupMessage, "書誌情報の取得に失敗しました。", true);
  } finally {
    lookupButton.disabled = false;
    lookupButton.textContent = "ISBNから取得";
  }
}

if (checkForm) {
  checkForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const isbn = normalizeIsbn(checkIsbnInput.value);

    if (!isbn) {
      setCheckResult("error", "ISBNを入力してください。");
      return;
    }

    const response = await fetch(`/api/check?isbn=${encodeURIComponent(isbn)}`);
    const data = await response.json();

    if (!response.ok) {
      setCheckResult("error", data.error || "確認に失敗しました。");
      return;
    }

    if (data.owned) {
      const author = data.book.author ? ` / ${data.book.author}` : "";
      const publisher = data.book.publisher ? ` / ${data.book.publisher}` : "";
      setCheckResult("owned", `所蔵あり: ${data.book.title}${author}${publisher}`);
      return;
    }

    setCheckResult("missing", "このISBNの本はまだ登録されていません。");
  });
}

if (bookForm) {
  lookupButton.addEventListener("click", lookupBookByIsbn);

  bookIsbnInput.addEventListener("blur", async () => {
    const isbn = normalizeIsbn(bookIsbnInput.value);

    if (isbn.length === 10 || isbn.length === 13) {
      await lookupBookByIsbn();
    }
  });

  bookCoverInput.addEventListener("input", () => {
    updateCoverPreview(bookCoverInput.value, bookTitleInput.value);
  });

  bookTitleInput.addEventListener("input", () => {
    updateCoverPreview(bookCoverInput.value, bookTitleInput.value);
  });

  bookForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearInlineMessage(formMessage);

    const formData = new FormData(bookForm);
    const payload = {
      isbn: normalizeIsbn(formData.get("isbn")),
      title: String(formData.get("title") || "").trim(),
      author: String(formData.get("author") || "").trim(),
      publisher: String(formData.get("publisher") || "").trim(),
      coverUrl: String(formData.get("coverUrl") || "").trim(),
      overwrite: false
    };

    let { response, data } = await submitBook(payload);

    if (response.status === 409) {
      const confirmed = window.confirm(data.error || "同じISBNの本が登録済みです。上書きしますか？");
      if (!confirmed) {
        setInlineMessage(formMessage, "登録をキャンセルしました。", true);
        return;
      }

      ({ response, data } = await submitBook({
        ...payload,
        overwrite: true
      }));
    }

    if (!response.ok) {
      setInlineMessage(formMessage, data.error || "登録に失敗しました。", true);
      return;
    }

    bookForm.reset();
    clearInlineMessage(lookupMessage);
    setInlineMessage(formMessage, data.message || "登録しました。");
    updateCoverPreview("");
  });

  updateCoverPreview("");
}

if (bookList) {
  fetchBooks().catch(() => {
    bookList.className = "book-list empty";
    bookList.textContent = "一覧の読み込みに失敗しました。";
  });

  bookList.addEventListener("click", async (event) => {
    const button = event.target.closest(".delete-button");
    if (!button) {
      return;
    }

    const { isbn } = button.dataset;
    const response = await fetch(`/api/books/${encodeURIComponent(isbn)}`, {
      method: "DELETE"
    });
    const data = await response.json();

    if (!response.ok) {
      setInlineMessage(formMessage, data.error || "削除に失敗しました。", true);
      return;
    }

    setInlineMessage(formMessage, data.message || "削除しました。");
    await fetchBooks();
  });
}
