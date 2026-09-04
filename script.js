const API_ENDPOINT = "/api/search";

const $ = (selector) => document.querySelector(selector);

const homeView = $("#homeView");
const resultsView = $("#resultsView");
const searchForm = $("#searchForm");
const searchInput = $("#searchInput");
const searchShell = $("#searchShell");
const clearButton = $("#clearButton");
const suggestions = $("#suggestions");

const resultsSearchForm = $("#resultsSearchForm");
const resultsInput = $("#resultsInput");
const resultsClearButton = $("#resultsClearButton");
const resultsList = $("#resultsList");
const resultsStatus = $("#resultsStatus");

let currentQuery = "";
let currentType = "web";
let suggestionTimer = null;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

function showClearButton(input, button) {
  button.classList.toggle("visible", Boolean(input.value));
}

function setTheme(theme) {
  const resolved = theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : theme;

  document.documentElement.dataset.theme = resolved;
  localStorage.setItem("websearch-theme", theme);
}

function goHome() {
  resultsView.hidden = true;
  homeView.hidden = false;
  searchInput.value = currentQuery;
  showClearButton(searchInput, clearButton);
  setTimeout(() => searchInput.focus(), 0);
  history.pushState({ page: "home" }, "", location.pathname);
}

function showResultsView(query) {
  currentQuery = query;
  homeView.hidden = true;
  resultsView.hidden = false;
  resultsInput.value = query;
  showClearButton(resultsInput, resultsClearButton);
  history.pushState({ page: "results", query }, "", `?q=${encodeURIComponent(query)}`);
  resultsInput.focus();
}

async function performSearch(query, type = "web") {
  query = query.trim();
  if (!query) return;

  currentQuery = query;
  currentType = type;
  showResultsView(query);

  resultsStatus.innerHTML = `<span class="loading"><span class="spinner"></span> Searching the web…</span>`;
  resultsList.innerHTML = "";

  try {
    const url = new URL(API_ENDPOINT, window.location.origin);
    url.searchParams.set("q", query);
    url.searchParams.set("type", type);

    const response = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json" },
      credentials: "same-origin"
    });

    if (!response.ok) {
      throw new Error(`Search request failed (${response.status})`);
    }

    const data = await response.json();
    renderResults(data);
  } catch (error) {
    console.error(error);
    resultsStatus.textContent = "";
    resultsList.innerHTML = `
      <div class="empty-state">
        <strong>We couldn't complete that search.</strong>
        <span>The search service is unavailable right now. Please try again.</span>
      </div>`;
  }
}

function renderResults(data) {
  const results = Array.isArray(data?.results) ? data.results : [];

  if (typeof data?.total === "number") {
    resultsStatus.textContent = `${data.total.toLocaleString()} results`;
  } else {
    resultsStatus.textContent = results.length
      ? `Showing ${results.length} results`
      : "";
  }

  if (!results.length) {
    resultsList.innerHTML = `
      <div class="empty-state">
        <strong>No results found.</strong>
        <span>Try different words or a broader search.</span>
      </div>`;
    return;
  }

  resultsList.innerHTML = results.map((item) => {
    const title = escapeHTML(item.title || item.name || "Untitled result");
    const url = escapeHTML(item.url || item.link || "#");
    const description = escapeHTML(item.description || item.snippet || "");
    const safeHref = escapeHTML(item.url || item.link || "#");
    const newTabToggle = $("#newTabToggle");
    const openNewTab = newTabToggle && newTabToggle.checked;

    return `
      <article class="result">
        <span class="result-url">${url}</span>
        <a class="result-title" href="${safeHref}" ${openNewTab ? 'target="_blank" rel="noopener noreferrer"' : ""}>${title}</a>
        <p class="result-description">${description}</p>
      </article>`;
  }).join("");
}

function renderSuggestions(items) {
  const suggestionsToggle = $("#suggestionsToggle");
  if (!suggestionsToggle || !suggestionsToggle.checked || !items.length) {
    suggestions.hidden = true;
    suggestions.innerHTML = "";
    return;
  }

  suggestions.innerHTML = items.slice(0, 8).map((item) => `
    <button class="suggestion" type="button" data-query="${escapeHTML(item)}">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="10.8" cy="10.8" r="6.7"></circle>
        <path d="m16 16 5 5"></path>
      </svg>
      <span>${escapeHTML(item)}</span>
    </button>`).join("");

  suggestions.hidden = false;
}

async function fetchSuggestions(query) {
  try {
    const url = new URL("/api/suggestions", window.location.origin);
    url.searchParams.set("q", query);

    const response = await fetch(url, {
      headers: { "Accept": "application/json" },
      credentials: "same-origin"
    });

    if (!response.ok) return;
    const data = await response.json();
    renderSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
  } catch {
    // Suggestions are optional
  }
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  suggestions.hidden = true;
  performSearch(searchInput.value);
});

resultsSearchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  performSearch(resultsInput.value, currentType);
});

searchInput.addEventListener("input", () => {
  showClearButton(searchInput, clearButton);
  clearTimeout(suggestionTimer);

  const query = searchInput.value.trim();
  if (!query || query.length < 2) {
    suggestions.hidden = true;
    return;
  }

  const suggestionsToggle = $("#suggestionsToggle");
  if (!suggestionsToggle || !suggestionsToggle.checked) return;

  suggestionTimer = setTimeout(() => fetchSuggestions(query), 180);
});

searchInput.addEventListener("focus", () => {
  const suggestionsToggle = $("#suggestionsToggle");
  if (searchInput.value.trim().length >= 2 && suggestionsToggle && suggestionsToggle.checked) {
    fetchSuggestions(searchInput.value.trim());
  }
});

resultsInput.addEventListener("input", () => {
  showClearButton(resultsInput, resultsClearButton);
});

clearButton.addEventListener("click", () => {
  searchInput.value = "";
  suggestions.hidden = true;
  showClearButton(searchInput, clearButton);
  searchInput.focus();
});

resultsClearButton.addEventListener("click", () => {
  resultsInput.value = "";
  showClearButton(resultsInput, resultsClearButton);
  resultsInput.focus();
});

suggestions.addEventListener("click", (event) => {
  const button = event.target.closest(".suggestion");
  if (!button) return;
  const query = button.dataset.query || "";
  searchInput.value = query;
  suggestions.hidden = true;
  performSearch(query);
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    currentType = tab.dataset.type;
    if (currentQuery) performSearch(currentQuery, currentType);
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    suggestions.hidden = true;
  }

  if (event.key === "/" && document.activeElement?.tagName !== "INPUT") {
    event.preventDefault();
    (resultsView.hidden ? searchInput : resultsInput).focus();
  }
});

window.addEventListener("popstate", () => {
  const query = new URLSearchParams(location.search).get("q");
  if (query) {
    currentQuery = query;
    showResultsView(query);
    performSearch(query, currentType);
  } else {
    goHome();
  }
});

// Restore preferences
const savedTheme = localStorage.getItem("websearch-theme") || "system";
setTheme(savedTheme);

// If opened directly with ?q=..., run the search once the page loads
const initialQuery = new URLSearchParams(location.search).get("q");
if (initialQuery) {
  performSearch(initialQuery);
}