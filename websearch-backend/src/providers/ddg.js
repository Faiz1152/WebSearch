// Minimal DuckDuckGo HTML scraper provider for Cloudflare Workers

export async function searchWithDuckDuckGo(query, type, env){
  // DuckDuckGo doesn't require an API key. We'll scrape the HTML results page.
  // For images/news/videos we provide lightweight redirects to DuckDuckGo.
  if (type !== 'web' && type !== 'all') {
    // For unsupported types, return an empty result set; frontend will show link to external site.
    return [];
  }

  const ddg = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const resp = await fetch(ddg, {headers:{'User-Agent':'WebSearch/1.0'}});
  if (!resp.ok) throw new Error('Provider fetch failed');
  const text = await resp.text();

  // Very small, forgiving HTML parsing using regex to extract result blocks.
  // This is intentionally simple; if you replace the provider with a proper API, update this module.
  const results = [];
  // Match anchor and surrounding snippet
  const re = /<div[^>]*class="result[^>]*">([\s\S]*?)<\/div>\s*<\/div>/gi;
  let m;
  while ((m = re.exec(text)) && results.length < 30) {
    const block = m[1];
    // title
    const aMatch = /<a[^>]*class="[^\"]*result__a[^\"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block) || /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (!aMatch) continue;
    let href = aMatch[1];
    let title = aMatch[2].replace(/<[^>]+>/g,'').trim();
    // snippet
    const snMatch = /<a[^>]*class="[^\"]*result__snippet[^\"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(block) || /<div[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i.exec(block);
    const snippet = snMatch ? snMatch[1].replace(/<[^>]+>/g,'').trim() : '';

    // normalize href
    try{ href = new URL(href, 'https://duckduckgo.com').href; }catch(e){ /* leave as-is */ }

    // display url (domain)
    let displayUrl = '';
    try{ displayUrl = (new URL(href)).host; }catch(e){ displayUrl = href; }

    results.push({ title, url: href, description: snippet, displayUrl });
  }

  return results;
}

export async function suggestionsWithDuckDuckGo(query){
  try{
    const url = `https://duckduckgo.com/ac/?q=${encodeURIComponent(query)}`;
    const resp = await fetch(url, {headers:{'User-Agent':'WebSearch/1.0'}});
    if (!resp.ok) return [];
    const json = await resp.json();
    return Array.isArray(json) ? json.map(i => i.phrase || i) : [];
  }catch(e){ return []; }
}
