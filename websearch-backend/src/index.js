/* WebSearch Cloudflare Worker */

import {
  searchWithSearchApi,
  suggestionsWithSearchApi
} from "./providers/ddg.js";


export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request)
      });
    }

    // Search endpoint
    if (url.pathname === "/api/search") {
      return handleSearch(request, env);
    }

    // Suggestions endpoint
    if (url.pathname === "/api/suggestions") {
      return handleSuggestions(request, env);
    }

    // Simple status endpoint
    if (url.pathname === "/") {
      return new Response(
        JSON.stringify({
          status: "ok",
          service: "WebSearch backend"
        }),
        {
          status: 200,
          headers: corsHeaders(request, {
            "Content-Type": "application/json"
          })
        }
      );
    }

    return new Response(
      JSON.stringify({
        error: true,
        message: "Not found"
      }),
      {
        status: 404,
        headers: corsHeaders(request, {
          "Content-Type": "application/json"
        })
      }
    );
  }
};


/* ---------------- CORS ---------------- */

function corsHeaders(request, extra = {}) {
  const origin = request.headers.get("Origin") || "*";

  return Object.assign(
    {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
      "Vary": "Origin"
    },
    extra
  );
}


/* ---------------- SEARCH ---------------- */

async function handleSearch(request, env) {
  try {
    const url = new URL(request.url);

    const q = (url.searchParams.get("q") || "").trim();

    const type = (
      url.searchParams.get("type") || "all"
    ).toLowerCase();

    // Validate query
    if (!q) {
      return jsonError(
        "Missing query parameter (q)",
        400,
        request
      );
    }

    if (q.length > 300) {
      return jsonError(
        "Query too long",
        400,
        request
      );
    }

    // Validate search type
    if (!["web", "images", "news", "videos", "all"].includes(type)) {
      return jsonError(
        "Invalid search type",
        400,
        request
      );
    }

    // Make sure the API key exists
    if (!env.SEARCH_API_KEY) {
      console.error("SEARCH_API_KEY is missing");

      return jsonError(
        "Search API key is not configured",
        500,
        request
      );
    }

    // SearchApi / Google search
    const results = await searchWithSearchApi(
      q,
      type,
      env
    );

    return new Response(
      JSON.stringify({
        results: results.slice(0, 50),
        total: results.length
      }),
      {
        status: 200,
        headers: corsHeaders(request, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        })
      }
    );

  } catch (error) {
    console.error(
      "Search handler error:",
      error
    );

    return jsonError(
      "Search service is temporarily unavailable.",
      503,
      request
    );
  }
}


/* ---------------- SUGGESTIONS ---------------- */

async function handleSuggestions(request, env) {
  try {
    const url = new URL(request.url);

    const q = (
      url.searchParams.get("q") || ""
    ).trim();

    if (!q) {
      return new Response(
        JSON.stringify({
          suggestions: []
        }),
        {
          status: 200,
          headers: corsHeaders(request, {
            "Content-Type": "application/json"
          })
        }
      );
    }

    const suggestions =
      await suggestionsWithSearchApi(q, env);

    return new Response(
      JSON.stringify({
        suggestions
      }),
      {
        status: 200,
        headers: corsHeaders(request, {
          "Content-Type": "application/json"
        })
      }
    );

  } catch (error) {
    console.error(
      "Suggestions error:",
      error
    );

    return new Response(
      JSON.stringify({
        suggestions: []
      }),
      {
        status: 200,
        headers: corsHeaders(request, {
          "Content-Type": "application/json"
        })
      }
    );
  }
}


/* ---------------- ERROR RESPONSE ---------------- */

function jsonError(
  message,
  status = 500,
  request
) {
  return new Response(
    JSON.stringify({
      error: true,
      message
    }),
    {
      status,
      headers: corsHeaders(request, {
        "Content-Type": "application/json"
      })
    }
  );
}
