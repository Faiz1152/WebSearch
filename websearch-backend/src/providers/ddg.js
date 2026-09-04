export async function searchWithSearchApi(query, type, env) {
  if (!env.SEARCH_API_KEY) {
    throw new Error("SEARCH_API_KEY is not configured");
  }

  const apiUrl = new URL("https://www.searchapi.io/api/v1/search");

  apiUrl.searchParams.set("engine", "google");
  apiUrl.searchParams.set("q", query);
  apiUrl.searchParams.set("link", "resolved");

  const response = await fetch(apiUrl.toString(), {
    headers: {
      "Authorization": `Bearer ${env.SEARCH_API_KEY}`,
      "Accept": "application/json"
    }
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("SearchApi error:", JSON.stringify(data));
    throw new Error(data.error || data.message || "SearchApi request failed");
  }

  const organic = Array.isArray(data.organic_results)
    ? data.organic_results
    : [];

  return organic.map(result => ({
    title: result.title || "",
    url: result.link || "",
    description: result.snippet || "",
    displayUrl: result.displayed_link || result.link || "",
    thumbnail: result.thumbnail || null
  }));
}

export async function suggestionsWithSearchApi(query, env) {
  return [];
}
