from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager
from typing import Any
from urllib.parse import urlparse

import httpx
import uvicorn
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

try:
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
except Exception:  # pragma: no cover - optional runtime path
    AsyncWebCrawler = None
    BrowserConfig = None
    CrawlerRunConfig = None


load_dotenv()


def env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def normalize_base_url(url: str) -> str:
    return url.rstrip("/")


def get_domain(url: str) -> str:
    try:
        return urlparse(url).netloc
    except Exception:
        return ""


class Settings(BaseModel):
    host: str = Field(default_factory=lambda: os.getenv("HOST", "127.0.0.1"))
    port: int = Field(default_factory=lambda: env_int("PORT", 8765))
    token: str = Field(default_factory=lambda: os.getenv("LOCAL_WEB_SEARCH_TOKEN", ""))
    searxng_instance_url: str = Field(
        default_factory=lambda: os.getenv("SEARXNG_INSTANCE_URL", "http://127.0.0.1:8080")
    )
    searxng_api_key: str = Field(default_factory=lambda: os.getenv("SEARXNG_API_KEY", ""))
    request_timeout: int = Field(default_factory=lambda: env_int("REQUEST_TIMEOUT", 20))
    max_results: int = Field(default_factory=lambda: env_int("MAX_RESULTS", 5))
    scrape_timeout: int = Field(default_factory=lambda: env_int("SCRAPE_TIMEOUT", 30))


class SearchRequest(BaseModel):
    query: str
    max_results: int | None = None
    category: str = "general"
    safe_search: int = 1
    language: str = "all"
    engines: str | None = None


class ScrapeRequest(BaseModel):
    urls: list[str]
    query: str | None = None
    max_content_length: int = 50000


class SearchAndScrapeRequest(SearchRequest):
    scrape: bool = True
    max_content_length: int = 50000


settings = Settings()


async def require_token(authorization: str | None = Header(default=None)) -> None:
    if not settings.token:
        return
    expected = f"Bearer {settings.token}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Invalid local web search token")


def make_search_url() -> str:
    base = normalize_base_url(settings.searxng_instance_url)
    return base if base.endswith("/search") else f"{base}/search"


def to_organic_result(result: dict[str, Any], position: int) -> dict[str, Any]:
    url = result.get("url") or result.get("link") or ""
    return {
        "position": position,
        "title": result.get("title") or "",
        "link": url,
        "snippet": result.get("content") or result.get("snippet") or "",
        "date": result.get("publishedDate") or result.get("published_date") or "",
        "attribution": get_domain(url),
    }


async def search_searxng(request: SearchRequest) -> dict[str, Any]:
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    max_results = request.max_results or settings.max_results
    params: dict[str, Any] = {
        "q": request.query,
        "format": "json",
        "pageno": 1,
        "categories": request.category,
        "language": request.language,
        "safesearch": request.safe_search,
    }
    if request.engines:
        params["engines"] = request.engines

    headers = {"Accept": "application/json"}
    if settings.searxng_api_key:
        headers["X-API-Key"] = settings.searxng_api_key

    async with httpx.AsyncClient(timeout=settings.request_timeout) as client:
        response = await client.get(make_search_url(), params=params, headers=headers)

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"SearXNG returned {response.status_code}: {response.text[:500]}",
        )

    data = response.json()
    raw_results = data.get("results") or []
    organic = [
        to_organic_result(result, index + 1)
        for index, result in enumerate(raw_results[:max_results])
    ]
    images = [
        {
            "position": index + 1,
            "title": result.get("title") or "",
            "imageUrl": result.get("img_src") or result.get("thumbnail") or "",
            "source": get_domain(result.get("url") or ""),
            "domain": get_domain(result.get("url") or ""),
            "link": result.get("url") or "",
        }
        for index, result in enumerate(raw_results)
        if result.get("img_src")
    ][:6]

    return {
        "organic": organic,
        "topStories": [],
        "images": images,
        "videos": [],
        "news": [],
        "places": [],
        "shopping": [],
        "peopleAlsoAsk": [],
        "relatedSearches": [{"query": item} for item in data.get("suggestions", [])],
        "knowledgeGraph": None,
        "answerBox": None,
    }


def html_to_text(html: str) -> tuple[str, str]:
    soup = BeautifulSoup(html, "html.parser")
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()
    text = soup.get_text("\n", strip=True)
    return title, text


async def scrape_with_http(url: str, max_content_length: int) -> dict[str, Any]:
    headers = {
        "User-Agent": "LibreChatLocalWebSearch/0.1 (+https://librechat.ai)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    async with httpx.AsyncClient(follow_redirects=True, timeout=settings.scrape_timeout) as client:
        response = await client.get(url, headers=headers)
    response.raise_for_status()
    title, text = html_to_text(response.text)
    return {
        "url": str(response.url),
        "title": title,
        "content": text[:max_content_length],
        "references": {"links": [], "images": [], "videos": []},
    }


async def scrape_with_crawl4ai(url: str, max_content_length: int) -> dict[str, Any]:
    if AsyncWebCrawler is None or BrowserConfig is None or CrawlerRunConfig is None:
        return await scrape_with_http(url, max_content_length)

    browser_config = BrowserConfig(headless=True)
    run_config = CrawlerRunConfig()
    try:
        async with AsyncWebCrawler(config=browser_config) as crawler:
            result = await crawler.arun(url=url, config=run_config)
    except Exception:
        return await scrape_with_http(url, max_content_length)

    markdown = getattr(result, "markdown", None) or ""
    html = getattr(result, "html", None) or ""
    title = ""
    if html:
        title, fallback_text = html_to_text(html)
    else:
        fallback_text = ""
    content = markdown or fallback_text
    if not content:
        return await scrape_with_http(url, max_content_length)
    return {
        "url": url,
        "title": title,
        "content": content[:max_content_length],
        "references": {"links": [], "images": [], "videos": []},
    }


async def scrape_url(url: str, query: str | None, max_content_length: int) -> dict[str, Any]:
    try:
        result = await scrape_with_crawl4ai(url, max_content_length)
        text = result["content"].strip()
        highlight = text[:1200]
        return {
            **result,
            "highlights": [{"score": 1.0, "text": highlight}] if highlight else [],
            "error": False,
        }
    except Exception as exc:
        return {
            "url": url,
            "title": "",
            "content": "",
            "references": {"links": [], "images": [], "videos": []},
            "highlights": [],
            "error": True,
            "message": str(exc),
        }


def apply_scrape_to_sources(
    search_data: dict[str, Any],
    scraped: list[dict[str, Any]],
) -> dict[str, Any]:
    by_url = {item["url"]: item for item in scraped}
    for key in ("organic", "topStories"):
        for source in search_data.get(key, []):
            result = by_url.get(source.get("link"))
            if not result or result.get("error"):
                continue
            source["content"] = result.get("content", "")
            source["references"] = result.get("references")
            source["highlights"] = result.get("highlights", [])
            source["processed"] = True
            if result.get("title") and not source.get("title"):
                source["title"] = result["title"]
    return search_data


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="LibreChat Local Web Search", version="0.1.0", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "searxngInstanceUrl": settings.searxng_instance_url,
        "crawl4aiAvailable": AsyncWebCrawler is not None,
    }


@app.post("/search", dependencies=[Depends(require_token)])
async def search(request: SearchRequest) -> dict[str, Any]:
    return await search_searxng(request)


@app.post("/scrape", dependencies=[Depends(require_token)])
async def scrape(request: ScrapeRequest) -> dict[str, Any]:
    tasks = [
        scrape_url(url, request.query, request.max_content_length)
        for url in request.urls
        if url.startswith(("http://", "https://"))
    ]
    return {"results": await asyncio.gather(*tasks)}


@app.post("/search-and-scrape", dependencies=[Depends(require_token)])
async def search_and_scrape(request: SearchAndScrapeRequest) -> dict[str, Any]:
    search_data = await search_searxng(request)
    if not request.scrape:
        return search_data
    urls = [item["link"] for item in search_data.get("organic", []) if item.get("link")]
    scraped = await asyncio.gather(
        *[scrape_url(url, request.query, request.max_content_length) for url in urls]
    )
    return apply_scrape_to_sources(search_data, scraped)


def main() -> None:
    uvicorn.run("local_web_search.app:app", host=settings.host, port=settings.port, reload=False)


if __name__ == "__main__":
    main()
