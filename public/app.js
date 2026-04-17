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
const registerPanel = document.getElementById("register-panel");
const registerModeLabel = document.getElementById("register-mode-label");
const saveButton = document.getElementById("save-button");
const refreshMetadataButton = document.getElementById("refresh-metadata-button");
const deleteBookButton = document.getElementById("delete-book-button");
const cancelRegisterButton = document.getElementById("cancel-register-button");

const formMessage = document.getElementById("form-message");
const bookList = document.getElementById("book-list");
const bookDetail = document.getElementById("book-detail");
const detailMessage = document.getElementById("detail-message");
const viewShelfButton = document.getElementById("view-shelf");
const viewTableButton = document.getElementById("view-table");
const filterQueryInput = document.getElementById("filter-query");
const filterScopeInputs = document.querySelectorAll('input[name="filter-scope"]');

let currentBookListView = "shelf";
let currentRegisterMode = "create";
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

    const targetText =
      selectedScope === "author"
        ? book.author
        : selectedScope === "isbn"
          ? book.isbn
          : book.title;

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

async function findExistingBookByIsbn(isbn) {
  const { response, data } = await fetchBookByIsbn(isbn);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(data.error || "登録情報の確認に失敗しました。");
  }

  return data.book;
}

async function lookupMetadataByIsbn(isbn) {
  const response = await fetch(`/api/book-info?isbn=${encodeURIComponent(isbn)}`);
  const data = await response.json();

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(data.error || "書誌情報の取得に失敗しました。");
  }

  return data.book;
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

function showRegisterPanel() {
  registerPanel?.classList.remove("hidden");
}

function hideRegisterPanel() {
  registerPanel?.classList.add("hidden");
}

function setRegisterMode(mode) {
  currentRegisterMode = mode;

  if (!saveButton || !refreshMetadataButton || !deleteBookButton || !registerModeLabel) {
    return;
  }

  if (mode === "update") {
    registerModeLabel.textContent = "登録済みの本です。内容を確認して更新または削除できます。";
    saveButton.textContent = "更新";
    refreshMetadataButton.classList.remove("hidden");
    deleteBookButton.classList.remove("hidden");
    return;
  }

  registerModeLabel.textContent = "新しい本です。内容を確認して登録してください。";
  saveButton.textContent = "登録";
  refreshMetadataButton.classList.add("hidden");
  deleteBookButton.classList.add("hidden");
}

function fillRegisterFields(values) {
  bookTitleInput.value = values.title || "";
  bookAuthorInput.value = values.author || "";
  bookPublisherInput.value = values.publisher || "";
  bookPublishedDateInput.value = normalizeDate(values.publishedDate || values.published_date);
  bookPurchaseDateInput.value = normalizeDate(values.purchaseDate || values.purchase_date) || getTodayString();
  bookCoverInput.value = values.coverUrl || values.cover_url || "";
  updateCoverPreview(bookCoverInput.value, bookTitleInput.value);
}

function getCurrentRegisterValues() {
  return {
    title: bookTitleInput.value,
    author: bookAuthorInput.value,
    publisher: bookPublisherInput.value,
    publishedDate: bookPublishedDateInput.value,
    purchaseDate: bookPurchaseDateInput.value,
    coverUrl: bookCoverInput.value
  };
}

function resetRegisterFlow() {
  if (!bookForm) {
    return;
  }

  bookForm.reset();
  applyDefaultPurchaseDate();
  hideRegisterPanel();
  setRegisterMode("create");
  clearInlineMessage(lookupMessage);
  clearInlineMessage(formMessage);
  updateCoverPreview("");
}

async function lookupBookByIsbn() {
  clearInlineMessage(lookupMessage);
  clearInlineMessage(formMessage);

  const isbn = normalizeIsbn(bookIsbnInput?.value);
  if (!isbn) {
    setInlineMessage(lookupMessage, "ISBN を入力してください。", true);
    return;
  }

  lookupButton.disabled = true;
  lookupButton.textContent = "検索中...";

  try {
    const existingBook = await findExistingBookByIsbn(isbn);
    bookIsbnInput.value = isbn;

    if (existingBook) {
      fillRegisterFields(existingBook);
      setRegisterMode("update");
      showRegisterPanel();
      setInlineMessage(lookupMessage, "登録済みの本です。DB に保存されている内容を表示しています。");
      return;
    }

    const metadataBook = await lookupMetadataByIsbn(isbn).catch((error) => {
      if (!error.message) {
        throw error;
      }

      return null;
    });

    if (!metadataBook) {
      hideRegisterPanel();
      setInlineMessage(lookupMessage, "Google Books と登録済み一覧のどちらにも見つかりませんでした。", true);
      return;
    }

    fillRegisterFields({
      title: metadataBook.title,
      author: metadataBook.author,
      publisher: metadataBook.publisher,
      publishedDate: metadataBook.publishedDate,
      purchaseDate: getTodayString(),
      coverUrl: metadataBook.coverUrl
    });
    setRegisterMode("create");
    showRegisterPanel();
    setInlineMessage(lookupMessage, "Google Books から情報を読み込みました。内容を確認して登録してください。");
  } catch (error) {
    hideRegisterPanel();
    setInlineMessage(lookupMessage, error.message || "書誌情報の取得に失敗しました。", true);
  } finally {
    lookupButton.disabled = false;
    lookupButton.textContent = "検索";
  }
}

async function deleteCurrentBook() {
  const isbn = normalizeIsbn(bookIsbnInput?.value);
  if (!isbn) {
    setInlineMessage(formMessage, "削除する ISBN が見つかりません。", true);
    return;
  }

  const confirmed = window.confirm("この本を削除しますか？");
  if (!confirmed) {
    return;
  }

  const response = await fetch(`/api/books/${encodeURIComponent(isbn)}`, {
    method: "DELETE"
  });
  const data = await response.json();

  if (!response.ok) {
    setInlineMessage(formMessage, data.error || "削除に失敗しました。", true);
    return;
  }

  resetRegisterFlow();
  setInlineMessage(formMessage, data.message || "削除しました。");
}

async function refreshMetadataForCurrentBook() {
  const isbn = normalizeIsbn(bookIsbnInput?.value);
  if (!isbn) {
    setInlineMessage(formMessage, "ISBN を入力してください。", true);
    return;
  }

  const confirmed = window.confirm(
    "Google Book APIから本の情報を再取得します。既存の情報は消えますが、よろしいですか？"
  );
  if (!confirmed) {
    return;
  }

  refreshMetadataButton.disabled = true;
  refreshMetadataButton.textContent = "取得中...";
  clearInlineMessage(formMessage);

  try {
    const metadataBook = await lookupMetadataByIsbn(isbn);

    if (!metadataBook) {
      setInlineMessage(formMessage, "Google Books で本の情報が見つかりませんでした。", true);
      return;
    }

    const currentValues = getCurrentRegisterValues();
    fillRegisterFields({
      ...currentValues,
      title: metadataBook.title || currentValues.title,
      author: metadataBook.author || currentValues.author,
      publisher: metadataBook.publisher || currentValues.publisher,
      publishedDate: metadataBook.publishedDate || currentValues.publishedDate,
      coverUrl: metadataBook.coverUrl || currentValues.coverUrl
    });
    setInlineMessage(formMessage, "Google Books から情報を取得しました。");
  } catch (error) {
    setInlineMessage(formMessage, error.message || "書誌情報の取得に失敗しました。", true);
  } finally {
    refreshMetadataButton.disabled = false;
    refreshMetadataButton.textContent = "本の情報再取得";
  }
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

if (bookForm) {
  resetRegisterFlow();

  lookupButton.addEventListener("click", lookupBookByIsbn);
  bookIsbnInput?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    await lookupBookByIsbn();
  });

  bookCoverInput.addEventListener("input", () => {
    updateCoverPreview(bookCoverInput.value, bookTitleInput.value);
  });

  bookTitleInput.addEventListener("input", () => {
    updateCoverPreview(bookCoverInput.value, bookTitleInput.value);
  });

  cancelRegisterButton?.addEventListener("click", () => {
    resetRegisterFlow();
  });

  refreshMetadataButton?.addEventListener("click", async () => {
    await refreshMetadataForCurrentBook();
  });

  deleteBookButton?.addEventListener("click", async () => {
    await deleteCurrentBook();
  });

  bookForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (registerPanel?.classList.contains("hidden")) {
      await lookupBookByIsbn();
      return;
    }

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
      overwrite: currentRegisterMode === "update"
    };

    const { response, data } = await submitBook(payload);

    if (!response.ok) {
      setInlineMessage(formMessage, data.error || "保存に失敗しました。", true);
      return;
    }

    resetRegisterFlow();
    setInlineMessage(formMessage, data.message || "保存しました。");
  });
}

if (bookList) {
  updateBookListViewButtons();

  viewShelfButton?.addEventListener("click", () => {
    currentBookListView = "shelf";
    updateBookListViewButtons();
    renderFilteredBooks();
  });

  viewTableButton?.addEventListener("click", () => {
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
