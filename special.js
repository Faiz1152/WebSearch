/* WebSearch special components
   - Detects whether the search query + backend response contain enough
     real structured data to justify a special component (chart, map,
     weather, currency, definition, knowledge card, etc).
   - NEVER fabricates data. If the expected fields aren't present in the
     response, the corresponding component is simply not rendered and the
     normal results list is shown instead.
   - Exposes window.WebSearchSpecial = { render, renderVideoCard, renderNewsCard }
     so script.js (which owns the actual backend fetch/request code) can
     call into this without any changes to how it talks to the backend.
*/
(function () {
  function escapeHTML(s) {
    return String(s || '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[ch] || ch));
  }

  function safeHost(url) {
    try { return new URL(url, location.origin).host; } catch (e) { return ''; }
  }

  /* ---------------- QUERY HINTS ---------------- */
  // These only decide whether it's *worth checking* for structured data —
  // rendering itself always still depends on that data actually existing.
  const HINTS = {
    stock: /\b(stock|share price|shares?|ticker|nasdaq|nyse|market cap)\b/i,
    nearMe: /\bnear me\b|\bnearby\b/i,
    weather: /\bweather\b|\bforecast\b|\btemperature in\b/i,
    currency: /\bconvert\b.*\b(to)\b|\bexchange rate\b|\busd|eur|gbp|inr\b/i,
    calculator: /^[\s\d+\-*/^().%]+$/,
    definition: /^define\b|\bdefinition of\b|\bmeaning of\b/i
  };

  /* ---------------- DATA VALIDATION ----------------
     Each check requires the actual shape of real data, not just presence
     of a key. Nothing here invents numbers, coordinates, or facts. */

  function getTimeSeries(data) {
    // Look for a genuinely usable time-series on the response, e.g.
    // data.stock.history = [{date, price}, ...] or data.chart.points = [...]
    const candidates = [data && data.stock && data.stock.history, data && data.chart && data.chart.points];
    for (const series of candidates) {
      if (Array.isArray(series) && series.length >= 2) {
        const points = series
          .map(p => ({
            label: p.date || p.label || p.t || '',
            value: Number(p.price ?? p.value ?? p.close ?? p.y)
          }))
          .filter(p => Number.isFinite(p.value));
        if (points.length >= 2) return points;
      }
    }
    return null;
  }

  function getStockInfo(data) {
    const s = data && data.stock;
    if (!s || typeof s !== 'object') return null;
    if (!s.symbol && !s.name) return null;
    if (typeof s.price !== 'number' && typeof s.price !== 'string') return null;
    return s;
  }

  function getPlaces(data, results) {
    const pool = [];
    if (Array.isArray(data && data.places)) pool.push(...data.places);
    if (Array.isArray(results)) pool.push(...results);
    const places = pool.filter(it => it && (
      (typeof it.latitude === 'number' && typeof it.longitude === 'number') ||
      (typeof it.lat === 'number' && typeof it.lng === 'number') ||
      (it.location && typeof it.location.lat === 'number' && typeof it.location.lng === 'number')
    )).map(it => {
      const lat = it.latitude ?? it.lat ?? (it.location && it.location.lat);
      const lng = it.longitude ?? it.lng ?? (it.location && it.location.lng);
      return { name: it.title || it.name || 'Location', address: it.address || it.displayUrl || '', lat, lng };
    });
    return places.length ? places : null;
  }

  function getWeather(data) {
    const w = data && data.weather;
    if (!w || typeof w !== 'object') return null;
    if (typeof w.temperature !== 'number' && typeof w.temperature !== 'string') return null;
    return w;
  }

  function getCurrency(data) {
    const c = data && (data.currency || data.conversion);
    if (!c || typeof c !== 'object') return null;
    if (typeof c.result === 'undefined') return null;
    return c;
  }

  function getDefinition(data) {
    const d = data && data.definition;
    if (!d) return null;
    if (typeof d === 'string' && d.trim()) return { word: '', text: d };
    if (typeof d === 'object' && d.text) return d;
    return null;
  }

  function getCalculatorAnswer(data) {
    if (data && (typeof data.calculatorResult !== 'undefined')) return data.calculatorResult;
    return null;
  }

  function getKnowledge(data) {
    const k = data && data.knowledge;
    if (!k || typeof k !== 'object' || !k.title) return null;
    return k;
  }

  /* ---------------- RENDERERS ---------------- */

  function renderChart(points, title) {
    const w = 640, h = 220, pad = 32;
    const values = points.map(p => p.value);
    const min = Math.min(...values), max = Math.max(...values);
    const range = (max - min) || 1;
    const stepX = (w - pad * 2) / (points.length - 1);
    const coords = points.map((p, i) => {
      const x = pad + i * stepX;
      const y = h - pad - ((p.value - min) / range) * (h - pad * 2);
      return [x, y];
    });
    const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(' ');
    const areaPath = `${path} L${coords[coords.length - 1][0].toFixed(1)},${h - pad} L${coords[0][0].toFixed(1)},${h - pad} Z`;
    const first = points[0].value, last = points[points.length - 1].value;
    const up = last >= first;
    const lineColor = up ? '#16a34a' : '#dc2626';
    const firstLabel = escapeHTML(points[0].label);
    const lastLabel = escapeHTML(points[points.length - 1].label);

    return `
      <div class="chart-container">
        <div class="chart-title">${escapeHTML(title)}</div>
        <svg class="chart-canvas" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHTML(title)} chart from ${firstLabel} to ${lastLabel}">
          <path d="${areaPath}" fill="${lineColor}" opacity="0.08"></path>
          <path d="${path}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>
          <text x="${pad}" y="${h - 8}" font-size="11" fill="currentColor" opacity="0.6">${firstLabel}</text>
          <text x="${w - pad}" y="${h - 8}" font-size="11" fill="currentColor" opacity="0.6" text-anchor="end">${lastLabel}</text>
        </svg>
      </div>`;
  }

  function renderStockCard(stock, points) {
    const price = escapeHTML(String(stock.price));
    const currency = escapeHTML(stock.currency || '');
    const change = typeof stock.change !== 'undefined' ? Number(stock.change) : null;
    const changePct = typeof stock.changePercent !== 'undefined' ? Number(stock.changePercent) : null;
    const changeStr = change !== null
      ? `${change >= 0 ? '+' : ''}${change}${changePct !== null ? ` (${changePct >= 0 ? '+' : ''}${changePct}%)` : ''}`
      : '';

    let html = `<div class="info-card"><h3>${escapeHTML(stock.name || stock.symbol)}${stock.symbol && stock.name ? ` (${escapeHTML(stock.symbol)})` : ''}</h3>`;
    html += `<p>${price}${currency ? ' ' + currency : ''}${changeStr ? ' · ' + escapeHTML(changeStr) : ''}</p></div>`;

    if (points) html += renderChart(points, `${stock.name || stock.symbol} — price history`);
    return html;
  }

  function renderMap(places) {
    const withCoords = places.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    if (!withCoords.length) return '';

    const avgLat = withCoords.reduce((s, p) => s + p.lat, 0) / withCoords.length;
    const avgLng = withCoords.reduce((s, p) => s + p.lng, 0) / withCoords.length;
    const mapId = 'map-' + Math.random().toString(36).slice(2, 9);

    const listHtml = withCoords.map(p => `
      <li><strong>${escapeHTML(p.name)}</strong>${p.address ? `<br><span class="settings-hint">${escapeHTML(p.address)}</span>` : ''}</li>
    `).join('');

    // Renders with Leaflet (loaded from CDN) if available; otherwise a clean
    // list-only fallback. Coordinates always come from the backend response.
    setTimeout(() => {
      function initMap() {
        const el = document.getElementById(mapId);
        if (!el || !window.L) return;
        const map = window.L.map(el, { scrollWheelZoom: false }).setView([avgLat, avgLng], 13);
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19
        }).addTo(map);
        withCoords.forEach(p => {
          window.L.marker([p.lat, p.lng]).addTo(map).bindPopup(`<strong>${escapeHTML(p.name)}</strong>${p.address ? `<br>${escapeHTML(p.address)}` : ''}`);
        });
      }
      if (window.L) { initMap(); return; }
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
        document.head.appendChild(link);
      }
      if (!document.getElementById('leaflet-js')) {
        const script = document.createElement('script');
        script.id = 'leaflet-js';
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
        script.onload = initMap;
        script.onerror = () => {
          const el = document.getElementById(mapId);
          if (el) el.outerHTML = `<ul class="map-fallback-list">${listHtml}</ul>`;
        };
        document.body.appendChild(script);
      } else {
        document.getElementById('leaflet-js').addEventListener('load', initMap);
      }
    }, 0);

    return `
      <div class="map-container">
        <div class="map-title">Locations</div>
        <div id="${mapId}" class="map-canvas"></div>
      </div>`;
  }

  function renderWeatherCard(w) {
    const temp = escapeHTML(String(w.temperature));
    const unit = escapeHTML(w.unit || '°');
    const cond = escapeHTML(w.condition || w.description || '');
    const place = escapeHTML(w.location || '');
    return `<div class="info-card"><h3>${place || 'Weather'}</h3><p>${temp}${unit}${cond ? ' · ' + cond : ''}</p></div>`;
  }

  function renderCurrencyCard(c) {
    const from = escapeHTML(c.from || '');
    const to = escapeHTML(c.to || '');
    const amount = escapeHTML(String(c.amount ?? '1'));
    const result = escapeHTML(String(c.result));
    return `<div class="info-card"><h3>Currency conversion</h3><p>${amount} ${from} = ${result} ${to}</p></div>`;
  }

  function renderDefinitionCard(d) {
    const word = escapeHTML(d.word || '');
    const text = escapeHTML(d.text || '');
    return `<div class="info-card"><h3>${word || 'Definition'}</h3><p>${text}</p></div>`;
  }

  function renderKnowledgeCard(k) {
    const title = escapeHTML(k.title || '');
    const desc = escapeHTML(k.description || '');
    return `<div class="info-card"><h3>${title}</h3>${desc ? `<p>${desc}</p>` : ''}</div>`;
  }

  function renderCalculatorCard(answer) {
    return `<div class="info-card"><h3>Result</h3><p>${escapeHTML(String(answer))}</p></div>`;
  }

  /* ---------------- MAIN ENTRY ---------------- */

  function render(container, query, data) {
    if (!container) return;
    container.innerHTML = '';
    const results = Array.isArray(data && data.results) ? data.results : [];
    const pieces = [];

    const stock = getStockInfo(data);
    if (stock) {
      pieces.push(renderStockCard(stock, getTimeSeries(data)));
    } else {
      const points = getTimeSeries(data);
      if (points) pieces.push(renderChart(points, query));
    }

    if (HINTS.nearMe.test(query) || /\bin\s+[a-z\s]+$/i.test(query)) {
      const places = getPlaces(data, results);
      if (places) {
        const mapHtml = renderMap(places);
        if (mapHtml) pieces.push(mapHtml);
      }
    }

    const weather = getWeather(data);
    if (weather) pieces.push(renderWeatherCard(weather));

    const currency = getCurrency(data);
    if (currency) pieces.push(renderCurrencyCard(currency));

    const definition = getDefinition(data);
    if (definition) pieces.push(renderDefinitionCard(definition));

    const knowledge = getKnowledge(data);
    if (knowledge) pieces.push(renderKnowledgeCard(knowledge));

    const calc = getCalculatorAnswer(data);
    if (calc !== null) pieces.push(renderCalculatorCard(calc));

    container.innerHTML = pieces.join('');
    container.hidden = pieces.length === 0;
  }

  /* ---------------- VIDEO / NEWS CARDS ----------------
     Built only from fields the backend may already provide (title, url,
     description, displayUrl, thumbnail) plus optional extras if present
     (duration, views, date, source) — nothing invented when absent. */

  function renderVideoCard(it) {
    const title = escapeHTML(it.title || it.name || '');
    const url = escapeHTML(it.url || it.link || '#');
    const thumb = it.thumbnail || it.image || '';
    const source = escapeHTML(it.source || it.displayUrl || safeHost(it.url || url));
    const openNew = (localStorage.getItem('websearch-open-new') || 'on') === 'on';
    const extras = [];
    if (it.duration) extras.push(escapeHTML(it.duration));
    if (it.views) extras.push(escapeHTML(String(it.views)) + ' views');
    if (it.date) extras.push(escapeHTML(it.date));

    const thumbHtml = thumb
      ? `<img src="${escapeHTML(thumb)}" alt="" loading="lazy" onerror="this.closest('.video-thumb-wrap').innerHTML='<div class=\\'video-thumb-fallback\\'><svg viewBox=\\'0 0 24 24\\' aria-hidden=\\'true\\'><polygon points=\\'6 3 20 12 6 21 6 3\\'></polygon></svg></div>'">`
      : `<div class="video-thumb-fallback"><svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg></div>`;

    return `
      <div class="video-card">
        <a class="video-thumb-wrap" href="${url}" ${openNew ? 'target="_blank" rel="noopener noreferrer"' : ''} aria-label="${title}">
          ${thumbHtml}
          <span class="video-play-badge"><svg viewBox="0 0 24 24"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg></span>
        </a>
        <div class="video-body">
          <a class="result-title" href="${url}" ${openNew ? 'target="_blank" rel="noopener noreferrer"' : ''}>${title}</a>
          <div class="video-meta">${[source, ...extras].filter(Boolean).map(s => `<span>${s}</span>`).join('<span aria-hidden="true">·</span>')}</div>
        </div>
      </div>`;
  }

  function renderNewsCard(it) {
    const title = escapeHTML(it.title || it.name || '');
    const url = escapeHTML(it.url || it.link || '#');
    const desc = escapeHTML(it.description || it.snippet || '');
    const thumb = it.thumbnail || it.image || '';
    const source = escapeHTML(it.source || it.displayUrl || safeHost(it.url || url));
    const date = it.date ? escapeHTML(it.date) : '';
    const openNew = (localStorage.getItem('websearch-open-new') || 'on') === 'on';

    const thumbHtml = thumb
      ? `<div class="news-thumb"><img src="${escapeHTML(thumb)}" alt="" loading="lazy" onerror="this.closest('.news-thumb').remove()"></div>`
      : '';

    return `
      <div class="news-card">
        ${thumbHtml}
        <div class="news-body">
          <div class="news-source-line">${[source, date].filter(Boolean).map(s => `<span>${s}</span>`).join('<span aria-hidden="true">·</span>')}</div>
          <a class="result-title" href="${url}" ${openNew ? 'target="_blank" rel="noopener noreferrer"' : ''}>${title}</a>
          ${desc ? `<p class="result-description">${desc}</p>` : ''}
        </div>
      </div>`;
  }

  window.WebSearchSpecial = { render, renderVideoCard, renderNewsCard };
})();
