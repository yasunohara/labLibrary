const checkForm = document.getElementById("check-form");
const checkIsbnInput = document.getElementById("check-isbn");
const checkResult = document.getElementById("check-result");

const bookForm = document.getElementById("book-form");
const bookIsbnInput = document.getElementById("book-isbn");
const bookTitleInput = document.getElementById("book-title");
const bookAuthorInput = document.getElementById("book-author");
const bookPublisherInput = document.getElementById("book-publisher");
const bookPublishedDateInput = document.getElementById("book-published-date");
const bookPurchaseDateInput = document.getElementById("book-purchase-date");
const bookCoverInput = document.getElementById("book-cover-url");
const coverPreview = document.getElementById("cover-preview");
const lookupButton = document.getElementById("lookup-button");
const lookupMessage = document.getElementById("lookup-message");

const formMessage = document.getElementById("form-message");
const bookList = document.getElementById("book-list");
const bookDetail = document.getElementById("book-detail");
const detailMessage = document.getElementById("detail-message");
const viewShelfButton = document.getElementById("view-shelf");
const viewTableButton = document.getElementById("view-table");
const filterQueryInput = document.getElementById("filter-query");
const filterScopeInputs = document.querySelectorAll('input[name="filter-scope"]');

let currentBookListView = "shelf";
let allBooks = [];

function normalizeIsbn(value) {
  return String(value || "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

function normalizeDate(value) {
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

function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
    <img src="${escapeHtml(safeUrl)}" alt="${escapeHtml(title || "表紙")}" loading="lazy" />
  `;
}

function formatDateLabel(value) {
  const normalized = normalizeDate(value);
  if (!normalized) {
    return "未登録";
  }

  return normalized.replaceAll("-", "/");
}

function applyDefaultPurchaseDate() {
  if (!bookPurchaseDateInput) {
    return;
  }

  bookPurchaseDateInput.value = getTodayString();
}

function renderBookCover(book) {
  if (book.cover_url) {
    return `<img class="book-cover shelf-cover" src="${escapeHtml(book.cover_url)}" alt="${escapeHtml(book.title)}" loading="lazy" />`;
  }

  return `<div class="book-cover shelf-cover placeholder">NO IMAGE</div>`;
}

function getBookDetailUrl(isbn) {
  return `/book.html?isbn=${encodeURIComponent(isbn)}`;
}

function updateBookListViewButtons() {
  if (!viewShelfButton || !viewTableButton) {
    return;
  }

  const isShelfView = currentBookListView === "shelf";
  viewShelfButton.classList.toggle("active", isShelfView);
  viewTableButton.classList.toggle("active", !isShelfView);
  viewShelfButton.setAttribute("aria-selected", String(isShelfView));
  viewTableButton.setAttribute("aria-selected", String(!isShelfView));
}

function normalizeSearchText(value) {
  return String(value || "").trim().toLocaleLowerCase("ja-JP");
}

function getFilteredBooks() {
  const query = normalizeSearchText(filterQueryInput?.value);
  const selectedScope = Array.from(filterScopeInputs).find((input) => input.checked)?.value || "title";

  return allBooks.filter((book) => {
    if (!query) {
      return true;
    }

    const targetText = selectedScope === "author" ? book.author : book.title;
    return normalizeSearchText(targetText).includes(query);
  });
}

function renderFilteredBooks() {
  renderBooks(getFilteredBooks());
}

async function fetchBooks() {
  const response = await fetch("/api/books");
  const data = await response.json();
  allBooks = data.books || [];
  renderFilteredBooks();
}

async function fetchBookByIsbn(isbn) {
  const response = await fetch(`/api/books/${encodeURIComponent(isbn)}`);
  const data = await response.json();
  return { response, data };
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
    bookList.textContent = allBooks.length
      ? "条件に合う本が見つかりませんでした。"
      : "まだ本は登録されていません。";
    return;
  }

  if (currentBookListView === "table") {
    bookList.className = "book-list table-list";
    bookList.innerHTML = `
      <div class="book-table-wrap">
        <table class="book-table">
          <thead>
            <tr>
              <th>表紙</th>
              <th>タイトル</th>
              <th>著者</th>
              <th>出版社</th>
              <th>出版年月日</th>
              <th>購入日</th>
              <th>ISBN</th>
            </tr>
          </thead>
          <tbody>
            ${books
              .map((book) => {
                return `
                  <tr>
                    <td>
                      <a class="book-table-link book-table-cover-link" href="${escapeHtml(getBookDetailUrl(book.isbn))}" aria-label="${escapeHtml(book.title)} の詳細を見る">
                        ${renderBookCover(book)}
                      </a>
                    </td>
                    <td><a class="book-table-link" href="${escapeHtml(getBookDetailUrl(book.isbn))}">${escapeHtml(book.title)}</a></td>
                    <td>${escapeHtml(book.author || "未登録")}</td>
                    <td>${escapeHtml(book.publisher || "未登録")}</td>
                    <td>${escapeHtml(formatDateLabel(book.published_date))}</td>
                    <td>${escapeHtml(formatDateLabel(book.purchase_date))}</td>
                    <td>${escapeHtml(book.isbn)}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
    return;
  }

  bookList.className = "book-list shelf-grid";
  bookList.innerHTML = books
    .map((book) => {
      return `
        <a class="shelf-item" href="${escapeHtml(getBookDetailUrl(book.isbn))}" aria-label="${escapeHtml(book.title)} の詳細を見る">
          ${renderBookCover(book)}
          <div class="shelf-overlay">
            <h3>${escapeHtml(book.title)}</h3>
            <p>著者: ${escapeHtml(book.author || "未登録")}</p>
            <p>出版社: ${escapeHtml(book.publisher || "未登録")}</p>
            <p>出版年月日: ${escapeHtml(formatDateLabel(book.published_date))}</p>
            <p>購入日: ${escapeHtml(formatDateLabel(book.purchase_date))}</p>
            <p>ISBN: ${escapeHtml(book.isbn)}</p>
          </div>
        </a>
      `;
    })
    .join("");
}

function renderBookDetail(book) {
  if (!bookDetail) {
    return;
  }

  const cover = book.cover_url
    ? `<img class="detail-cover-image" src="${escapeHtml(book.cover_url)}" alt="${escapeHtml(book.title)}" loading="lazy" />`
    : `<div class="detail-cover-image placeholder">NO IMAGE</div>`;

  bookDetail.className = "book-detail-card";
  bookDetail.innerHTML = `
    <div class="detail-cover">${cover}</div>
    <div class="detail-meta">
      <p class="detail-kicker">Book Details</p>
      <h2>${escapeHtml(book.title)}</h2>
      <dl class="detail-grid">
        <div>
          <dt>ISBN</dt>
          <dd>${escapeHtml(book.isbn)}</dd>
        </div>
        <div>
          <dt>著者</dt>
          <dd>${escapeHtml(book.author || "未登録")}</dd>
        </div>
        <div>
          <dt>出版社</dt>
          <dd>${escapeHtml(book.publisher || "未登録")}</dd>
        </div>
        <div>
          <dt>出版年月日</dt>
          <dd>${escapeHtml(formatDateLabel(book.published_date))}</dd>
        </div>
        <div>
          <dt>購入日</dt>
          <dd>${escapeHtml(formatDateLabel(book.purchase_date))}</dd>
        </div>
        <div>
          <dt>登録日</dt>
          <dd>${escapeHtml(formatDateLabel(String(book.created_at || "").slice(0, 10)))}</dd>
        </div>
      </dl>
      <p class="detail-link-row">
        <a class="nav-link" href="/books.html">一覧に戻る</a>
      </p>
    </div>
  `;
}

async function loadBookDetailPage() {
  if (!bookDetail) {
    return;
  }

  const url = new URL(window.location.href);
  const isbn = normalizeIsbn(url.searchParams.get("isbn"));

  if (!isbn) {
    bookDetail.className = "book-list empty";
    bookDetail.textContent = "ISBN が指定されていません。";
    return;
  }

  try {
    const { response, data } = await fetchBookByIsbn(isbn);

    if (!response.ok) {
      bookDetail.className = "book-list empty";
      bookDetail.textContent = data.error || "本の詳細を読み込めませんでした。";
      return;
    }

    renderBookDetail(data.book);
  } catch {
    setInlineMessage(detailMessage, "本の詳細を読み込めませんでした。", true);
  }
}

async function lookupBookByIsbn() {
  clearInlineMessage(lookupMessage);
  const isbn = normalizeIsbn(bookIsbnInput?.value);

  if (!isbn) {
    setInlineMessage(lookupMessage, "ISBN を入力してください。", true);
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
    if (bookPublishedDateInput) {
      bookPublishedDateInput.value = normalizeDate(data.book.publishedDate);
    }
    bookCoverInput.value = data.book.coverUrl || "";
    updateCoverPreview(data.book.coverUrl, data.book.title);

    const apiKeyNote = data.apiKeyConfigured
      ? ""
      : " API キー未設定のため、利用制限にかかる可能性があります。";
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
      setCheckResult("error", "ISBN を入力してください。");
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
      setCheckResult("owned", `登録済み: ${data.book.title}${author}${publisher}`);
      return;
    }

    setCheckResult("missing", "この ISBN の本はまだ登録されていません。");
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
      publishedDate: normalizeDate(formData.get("publishedDate")),
      purchaseDate: normalizeDate(formData.get("purchaseDate")) || getTodayString(),
      coverUrl: String(formData.get("coverUrl") || "").trim(),
      overwrite: false
    };

    let { response, data } = await submitBook(payload);

    if (response.status === 409) {
      const confirmed = window.confirm(data.error || "同じ ISBN の本が存在します。上書きしますか？");
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
    applyDefaultPurchaseDate();
    clearInlineMessage(lookupMessage);
    setInlineMessage(formMessage, data.message || "登録しました。");
    updateCoverPreview("");
  });

  applyDefaultPurchaseDate();
  updateCoverPreview("");
}

if (bookList) {
  updateBookListViewButtons();

  viewShelfButton?.addEventListener("click", async () => {
    currentBookListView = "shelf";
    updateBookListViewButtons();
    renderFilteredBooks();
  });

  viewTableButton?.addEventListener("click", async () => {
    currentBookListView = "table";
    updateBookListViewButtons();
    renderFilteredBooks();
  });

  filterQueryInput?.addEventListener("input", () => {
    renderFilteredBooks();
  });

  filterScopeInputs.forEach((input) => {
    input.addEventListener("change", () => {
      renderFilteredBooks();
    });
  });

  fetchBooks().catch(() => {
    bookList.className = "book-list empty";
    bookList.textContent = "一覧の読み込みに失敗しました。";
  });
}

if (bookDetail) {
  loadBookDetailPage();
}
