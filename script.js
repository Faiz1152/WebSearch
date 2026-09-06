/* WebSearch frontend script */
(() => {
  const DEFAULT_BACKEND = localStorage.getItem('websearch-backend') || 'https://websearch-backend.khatrifaiz001.workers.dev';
  let API_BASE = DEFAULT_BACKEND.replace(/\/$/, '');
  const $ = sel => document.querySelector(sel);

  const homepage = document.getElementById('homepage');
  const searchForm = $('#searchForm');
  const searchInput = $('#searchInput');
  const suggestions = $('#suggestions');

  const resultsView = $('#resultsView');
  const resultsForm = $('#resultsSearchForm');
  const resultsInput = $('#resultsInput');
  const resultsStatus = $('#resultsStatus');
  const resultsList = $('#resultsList');
  const specialResults = $('#specialResults');
  const tabs = Array.from(document.querySelectorAll('.tab'));

  let currentQuery = '';
  let currentType = 'all';
  let suggestionTimer = null;
  let suggestionItems = [];
  let suggestionIndex = -1;

  function setBackend(url) {
    API_BASE = url.replace(/\/$/, '');
    localStorage.setItem('websearch-backend', API_BASE);
  }

  // Expose to settings page via localStorage
  window.__websearch_setBackend = setBackend;

  function showHome() {
    resultsView.hidden = true;
    homepage.hidden = false;
    searchInput.focus();
  }

  function showResults(query) {
    currentQuery = query;
    homepage.hidden = true;
    resultsView.hidden = false;
    resultsInput.value = query;
    resultsInput.focus();
    history.pushState({q: query}, '', `?q=${encodeURIComponent(query)}`);
  }

  async function performSearch(query, type = currentType) {
    query = (query || '').trim();
    if (!query) return;
    currentQuery = query;
    currentType = type || currentType;

    showResults(query);
    resultsStatus.innerHTML = `<span class="loading">Searching…</span>`;
    resultsList.innerHTML = renderSkeleton();
    if (specialResults) { specialResults.hidden = true; specialResults.innerHTML = ''; }

    try {
      const url = `${API_BASE}/api/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(type)}`;
      const resp = await fetch(url, {headers:{'Accept':'application/json'}});
      if (!resp.ok) {
        const body = await resp.json().catch(()=>null);
        const message = body && body.message ? body.message : 'Search service is temporarily unavailable.';
        throw new Error(message);
      }
      const data = await resp.json();
      if (window.WebSearchSpecial) window.WebSearchSpecial.render(specialResults, query, data);
      renderResults(data, type);
    } catch (err) {
      resultsStatus.textContent = '';
      resultsList.innerHTML = renderErrorState(err.message || 'Network or backend error.');
      console.error(err);
    }
  }

  function renderSkeleton() {
    const row = `<div class="skeleton-row"><div class="skeleton-line title"></div><div class="skeleton-line"></div><div class="skeleton-line short"></div></div>`;
    return `<div class="skeleton-list" aria-hidden="true">${row}${row}${row}</div>`;
  }

  function renderErrorState(message) {
    return `<div class="state-message error-state" role="alert">
      <svg class="state-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
      <strong>Search failed</strong>
      <p>${escapeHTML(message)}</p>
    </div>`;
  }

  function renderEmptyState() {
    return `<div class="state-message">
      <svg class="state-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      <strong>No results</strong>
      <p>Try different words or a broader search.</p>
    </div>`;
  }

  function escapeHTML(s){return String(s||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'"':'&#039;'}[ch]||ch));}

  function renderResults(data, type){
    const results = Array.isArray(data?.results) ? data.results : [];
    const total = typeof data?.total === 'number' ? data.total : results.length;

    resultsStatus.textContent = total ? `${total.toLocaleString()} results` : '';

    if (!results.length) {
      resultsList.innerHTML = renderEmptyState();
      return;
    }

    if (type === 'images') {
      // grid
      const html = ['<div class="grid">'];
      for (const it of results) {
        const thumb = escapeHTML(it.thumbnail || it.image || '');
        const title = escapeHTML(it.title || it.name || '');
        const src = escapeHTML(it.url || it.link || it.destination || '');
        const domain = escapeHTML(it.displayUrl || (new URL(it.url || src, location.origin)).host || '');
        const imgTag = thumb
          ? `<img src="${thumb}" alt="${title}" loading="lazy" onerror="this.closest('.grid-item').classList.add('img-broken'); this.remove();">`
          : '';
        html.push(`<div class="grid-item"><a href="${src}" target="_blank" rel="noopener noreferrer" aria-label="${title}">${imgTag}</a><div class="meta"><div class="result-title">${title}</div><div class="result-url">${domain}</div></div></div>`);
      }
      html.push('</div>');
      resultsList.innerHTML = html.join('');
      return;
    }

    if (type === 'videos' && window.WebSearchSpecial) {
      resultsList.innerHTML = `<div class="video-grid">${results.map(window.WebSearchSpecial.renderVideoCard).join('')}</div>`;
      return;
    }

    if (type === 'news' && window.WebSearchSpecial) {
      resultsList.innerHTML = `<div class="news-list">${results.map(window.WebSearchSpecial.renderNewsCard).join('')}</div>`;
      return;
    }

    // default list
    resultsList.innerHTML = results.map(it => {
      const title = escapeHTML(it.title || it.name || '');
      const url = escapeHTML(it.url || it.link || '#');
      const displayUrl = escapeHTML(it.displayUrl || (new URL(it.url || url, location.origin)).host || '');
      const desc = escapeHTML(it.description || it.snippet || '');
      const openNew = (localStorage.getItem('websearch-open-new') || 'on') === 'on';
      return `<div class="article-result"><div class="result-url">${displayUrl}</div><a class="result-title" href="${url}" ${openNew ? 'target="_blank" rel="noopener noreferrer"':''}>${title}</a><p class="result-description">${desc}</p></div>`;
    }).join('');
  }

  // suggestions
  async function fetchSuggestions(q){
    try {
      const url = `${API_BASE}/api/suggestions?q=${encodeURIComponent(q)}`;
      const resp = await fetch(url, {headers:{'Accept':'application/json'}});
      if (!resp.ok) return;
      const data = await resp.json();
      const items = Array.isArray(data?.suggestions) ? data.suggestions : [];
      renderSuggestions(items);
    } catch (e) { /* ignore */ }
  }

  function renderSuggestions(items){
    suggestionItems = items.slice(0,8);
    suggestionIndex = -1;
    if (!suggestionItems.length) { suggestions.hidden = true; suggestions.innerHTML = ''; return; }
    suggestions.innerHTML = suggestionItems.map((s,i)=>`<button type="button" class="suggestion" role="option" id="suggestion-${i}" aria-selected="false">${escapeHTML(s)}</button>`).join('');
    suggestions.hidden = false;
    searchInput.setAttribute('aria-expanded', 'true');
  }

  function closeSuggestions(){
    suggestions.hidden = true;
    suggestionIndex = -1;
    searchInput.setAttribute('aria-expanded', 'false');
    searchInput.removeAttribute('aria-activedescendant');
  }

  function highlightSuggestion(){
    const buttons = Array.from(suggestions.querySelectorAll('.suggestion'));
    buttons.forEach((b,i)=>{
      const active = i === suggestionIndex;
      b.setAttribute('aria-selected', active ? 'true' : 'false');
      if (active) { searchInput.setAttribute('aria-activedescendant', b.id); b.scrollIntoView({block:'nearest'}); }
    });
    if (suggestionIndex === -1) searchInput.removeAttribute('aria-activedescendant');
  }

  // events
  searchForm.addEventListener('submit', e=>{ e.preventDefault(); closeSuggestions(); performSearch(searchInput.value, 'all'); });
  resultsForm.addEventListener('submit', e=>{ e.preventDefault(); performSearch(resultsInput.value, currentType); });

  searchInput.addEventListener('input', ()=>{
    clearTimeout(suggestionTimer);
    const q = searchInput.value.trim();
    if (!q || q.length<2) { closeSuggestions(); suggestions.innerHTML=''; return; }
    suggestionTimer = setTimeout(()=>fetchSuggestions(q),180);
  });

  searchInput.addEventListener('keydown', e=>{
    if (suggestions.hidden || !suggestionItems.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      suggestionIndex = (suggestionIndex + 1) % suggestionItems.length;
      highlightSuggestion();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      suggestionIndex = suggestionIndex <= 0 ? suggestionItems.length - 1 : suggestionIndex - 1;
      highlightSuggestion();
    } else if (e.key === 'Enter') {
      if (suggestionIndex >= 0) {
        e.preventDefault();
        const val = suggestionItems[suggestionIndex];
        searchInput.value = val;
        closeSuggestions();
        performSearch(val, 'all');
      }
    } else if (e.key === 'Escape') {
      closeSuggestions();
    }
  });

  searchInput.addEventListener('blur', ()=>{
    // allow click on a suggestion to register before we close the list
    setTimeout(()=>{ if (!suggestions.matches(':hover')) closeSuggestions(); }, 120);
  });

  suggestions.addEventListener('click', e=>{
    const btn = e.target.closest('.suggestion'); if(!btn) return; searchInput.value = btn.textContent; closeSuggestions(); performSearch(btn.textContent,'all');
  });

  // tabs
  tabs.forEach(tab=> tab.addEventListener('click', ()=>{
    tabs.forEach(t=>{ t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
    tab.classList.add('active');
    tab.setAttribute('aria-selected','true');
    currentType = tab.dataset.type;
    if (currentQuery) performSearch(currentQuery, currentType);
  }));

  // keyboard shortcut
  document.addEventListener('keydown', e=>{
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); (resultsView.hidden ? searchInput : resultsInput).focus(); }
  });

  // handle initial query from URL
  const initQ = new URLSearchParams(location.search).get('q');
  if (initQ) performSearch(initQ, 'all');

  // expose for debugging
  window.__websearch_backend = API_BASE;
})();
