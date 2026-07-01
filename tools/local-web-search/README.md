# LibreChat Local Web Search

Local helper service for LibreChat web search. It keeps search and scraping on the user's machine:

- Search: calls a configured SearXNG instance.
- Scraping: uses Crawl4AI when available, with an HTTP fallback.
- API: exposes a LibreChat-compatible `/search-and-scrape` endpoint.

## Setup

On Windows, double-click:

```text
Start Local Web Search.bat
```

That launcher creates the local Python environments, downloads SearXNG, installs Crawl4AI, starts SearXNG on `http://127.0.0.1:8080`, and starts the LibreChat helper on `http://127.0.0.1:8765`.

Keep the launcher window open while using LibreChat web search.

Manual setup:

```powershell
cd tools/local-web-search
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .
python -m playwright install chromium
```

Create `.env` from `.env.example` and set `SEARXNG_INSTANCE_URL` if you are not using the launcher.

## Run

```powershell
local-web-search
```

Default URL: `http://127.0.0.1:8765`

## LibreChat

Configure LibreChat:

```yaml
webSearch:
  searchProvider: local
  localWebSearchUrl: 'http://127.0.0.1:8765'
  localWebSearchToken: '${LOCAL_WEB_SEARCH_TOKEN}'
```

If `LOCAL_WEB_SEARCH_TOKEN` is empty, the helper does not require a token.
