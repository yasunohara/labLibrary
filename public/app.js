const checkForm = document.getElementById("check-form");
const checkIsbnInput = document.getElementById("check-isbn");
const checkResult = document.getElementById("check-result");
const bookForm = document.getElementById("book-form");
const formMessage = document.getElementById("form-message");
const bookList = document.getElementById("book-list");

function normalizeIsbn(value) {
  return String(value || "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

function setCheckResult(kind, message) {
  checkResult.className = `result-card ${kind}`;
  checkResult.textContent = message;
}

function setFormMessage(message, isError = false) {
  formMessage.textContent = message;
  formMessage.className = isError ? "inline-message error" : "inline-message success";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function fetchBooks() {
  const response = await fetch("/api/books");
  const data = await response.json();
  renderBooks(data.books || []);
}

function renderBooks(books) {
  if (!books.length) {
    bookList.className = "book-list empty";
    bookList.textContent = "まだ本が登録されていません。";
    return;
  }

  bookList.className = "book-list";
  bookList.innerHTML = books
    .map(
      (book) => `
        <article class="book-item">
          <div>
            <h3>${escapeHtml(book.title)}</h3>
            <p>ISBN: ${escapeHtml(book.isbn)}</p>
            <p>著者: ${escapeHtml(book.author || "未登録")}</p>
          </div>
          <button class="delete-button" data-isbn="${escapeHtml(book.isbn)}">削除</button>
        </article>
      `
    )
    .join("");
}

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
    setCheckResult("owned", `所蔵あり: ${data.book.title}${author}`);
    return;
  }

  setCheckResult("missing", "このISBNの本はまだ登録されていません。");
});

bookForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFormMessage("");

  const formData = new FormData(bookForm);
  const payload = {
    isbn: normalizeIsbn(formData.get("isbn")),
    title: String(formData.get("title") || "").trim(),
    author: String(formData.get("author") || "").trim()
  };

  const response = await fetch("/api/books", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    setFormMessage(data.error || "登録に失敗しました。", true);
    return;
  }

  bookForm.reset();
  setFormMessage(data.message || "登録しました。");
  setCheckResult("neutral", "ここに確認結果が表示されます。");
  await fetchBooks();
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
    setFormMessage(data.error || "削除に失敗しました。", true);
    return;
  }

  setFormMessage(data.message || "削除しました。");
  await fetchBooks();
});

fetchBooks().catch(() => {
  bookList.className = "book-list empty";
  bookList.textContent = "一覧の読み込みに失敗しました。";
});
