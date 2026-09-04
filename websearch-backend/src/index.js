/* Cloudflare Worker entry (module) */
import { searchWithDuckDuckGo, suggestionsWithDuckDuckGo } from './providers/ddg.js';

const ALLOWED_ORIGIN = (typeof GLOBAL_ALLOWS !== 'undefined' && GLOBAL_ALLOWS) || (typeof process !== 'undefined' && process.env && process.env.ALLOWED_ORIGIN) || '*';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (url.pathname === '/api/search') {
      return handleSearch(request, env);
    }

    if (url.pathname === '/api/suggestions') {
      return handleSuggestions(request, env);
    }

    return new Response(JSON.stringify({ error:true, message:'Not found' }), { status: 404, headers: corsHeaders(request, {'Content-Type':'application/json'}) });
  }
};

function corsHeaders(request, extra = {}){
  const origin = request.headers.get('Origin') || '*';
  const allowed = (typeof ALLOWED_ORIGIN === 'string' && ALLOWED_ORIGIN) ? ALLOWED_ORIGIN : '*';
  return Object.assign({
    'Access-Control-Allow-Origin': allowed === '*' ? '*' : allowed,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600'
  }, extra);
}

async function handleSearch(request, env){
  try{
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim();
    const type = (url.searchParams.get('type') || 'web').toLowerCase();

    // validation
    if (!q) return jsonError('Missing query parameter (q)', 400, request);
    if (q.length > 300) return jsonError('Query too long', 400, request);
    if (!['web','images','news','videos','all'].includes(type)) return jsonError('Invalid type', 400, request);

    // Choose provider (DDG fallback). Provider code lives in src/providers
    // If you later add a commercial provider, use env.SEARCH_API_KEY and switch here.

    // Simple rate-limiting hint: rely on Cloudflare for production. Keep this lightweight.

    // Use DuckDuckGo scraping provider for now
    const results = await searchWithDuckDuckGo(q, type, env);

    return new Response(JSON.stringify({ results: results.slice(0, 50), total: results.length }), { status: 200, headers: corsHeaders(request, {'Content-Type':'application/json'}) });
  }catch(err){
    console.error('search handler error', err);
    return jsonError('Search service is temporarily unavailable.', 503, request);
  }
}

async function handleSuggestions(request, env){
  try{
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim();
    if (!q) return new Response(JSON.stringify({ suggestions: [] }), { status: 200, headers: corsHeaders(request, {'Content-Type':'application/json'}) });

    const suggestions = await suggestionsWithDuckDuckGo(q);
    return new Response(JSON.stringify({ suggestions }), { status: 200, headers: corsHeaders(request, {'Content-Type':'application/json'}) });
  }catch(e){
    console.error('suggestions error', e);
    return new Response(JSON.stringify({ suggestions: [] }), { status: 200, headers: corsHeaders(request, {'Content-Type':'application/json'}) });
  }
}

function jsonError(message, status=500, request){
  return new Response(JSON.stringify({ error:true, message }), { status, headers: corsHeaders(request, {'Content-Type':'application/json'}) });
}
