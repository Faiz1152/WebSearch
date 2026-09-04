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
  const tabs = Array.from(document.querySelectorAll('.tab'));

  let currentQuery = '';
  let currentType = 'all';
  let suggestionTimer = null;

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
    resultsList.innerHTML = '';

    try {
      const url = `${API_BASE}/api/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(type)}`;
      const resp = await fetch(url, {headers:{'Accept':'application/json'}});
      if (!resp.ok) {
        const body = await resp.json().catch(()=>null);
        const message = body && body.message ? body.message : 'Search service is temporarily unavailable.';
        throw new Error(message);
      }
      const data = await resp.json();
      renderResults(data, type);
    } catch (err) {
      resultsStatus.textContent = '';
      resultsList.innerHTML = `<div class="article-result"><strong>Search failed</strong><p class="result-description">${escapeHTML(err.message || 'Network or backend error.')}</p></div>`;
      console.error(err);
    }
  }

  function escapeHTML(s){return String(s||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'"':'&#039;'}[ch]||ch));}

  function renderResults(data, type){
    const results = Array.isArray(data?.results) ? data.results : [];
    const total = typeof data?.total === 'number' ? data.total : results.length;

    resultsStatus.textContent = total ? `${total.toLocaleString()} results` : '';

    if (!results.length) {
      resultsList.innerHTML = `<div class="article-result"><strong>No results</strong><p class="result-description">Try different words or a broader search.</p></div>`;
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
        html.push(`<div class="grid-item"><a href="${src}" target="_blank" rel="noopener noreferrer"><img src="${thumb}" alt="${title}" onerror="this.style.display='none'"></a><div class="meta"><div class="result-title">${title}</div><div class="result-url">${domain}</div></div></div>`);
      }
      html.push('</div>');
      resultsList.innerHTML = html.join('');
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
    if (!items.length) { suggestions.hidden = true; suggestions.innerHTML = ''; return; }
    suggestions.innerHTML = items.slice(0,8).map(s=>`<button type="button" class="suggestion">${escapeHTML(s)}</button>`).join('');
    suggestions.hidden = false;
  }

  // events
  searchForm.addEventListener('submit', e=>{ e.preventDefault(); suggestions.hidden=true; performSearch(searchInput.value, 'all'); });
  resultsForm.addEventListener('submit', e=>{ e.preventDefault(); performSearch(resultsInput.value, currentType); });

  searchInput.addEventListener('input', ()=>{
    clearTimeout(suggestionTimer);
    const q = searchInput.value.trim();
    if (!q || q.length<2) { suggestions.hidden=true; return; }
    suggestionTimer = setTimeout(()=>fetchSuggestions(q),180);
  });

  suggestions.addEventListener('click', e=>{
    const btn = e.target.closest('.suggestion'); if(!btn) return; searchInput.value = btn.textContent; suggestions.hidden=true; performSearch(btn.textContent,'all');
  });

  // tabs
  tabs.forEach(tab=> tab.addEventListener('click', ()=>{
    tabs.forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
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
