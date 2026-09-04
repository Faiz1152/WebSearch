# WebSearch backend (Cloudflare Workers)

This Worker implements a simple, provider-isolated search API for the WebSearch frontend.

Important: do NOT store your real API key in this repository. Use the Cloudflare Workers secret named `SEARCH_API_KEY`.

- API:
  - GET /api/search?q=QUERY&type=web|images|news|videos
  - GET /api/suggestions?q=QUERY

The Worker uses DuckDuckGo HTML scraping as a built-in provider when no external provider is configured. You can replace the provider implementation under src/providers.

See instructions in this README for local development and deployment.
