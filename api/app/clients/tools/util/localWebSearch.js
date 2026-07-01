const { Constants } = require('@librechat/agents');
const { tool } = require('@librechat/agents/langchain/tools');
const { Tools } = require('librechat-data-provider');

const WebSearchToolName = Tools.web_search;

const schema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'The search query to look up on the web.',
    },
    images: {
      type: 'boolean',
      description: 'Whether image results are requested.',
    },
    videos: {
      type: 'boolean',
      description: 'Whether video results are requested.',
    },
    news: {
      type: 'boolean',
      description: 'Whether news results are requested.',
    },
  },
  required: ['query'],
};

function assertLocalUrl(rawUrl) {
  const url = new URL(rawUrl);
  const allowedHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('LOCAL_WEB_SEARCH_URL must use http or https');
  }
  if (!allowedHosts.has(url.hostname)) {
    throw new Error('LOCAL_WEB_SEARCH_URL must point to localhost');
  }
  return url;
}

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function formatSource(source, index, turn, type) {
  const lines = [
    `# ${type === 'news' ? 'News' : 'Search'} ${index}: "${source.title || '(no title)'}"`,
    `Anchor: \\ue202turn${turn}${type}${index}`,
    `URL: ${source.link}`,
  ];
  if (source.snippet) {
    lines.push(`Summary: ${source.snippet}`);
  }
  if (source.date) {
    lines.push(`Date: ${source.date}`);
  }
  if (source.attribution) {
    lines.push(`Source: ${source.attribution}`);
  }
  const highlights = Array.isArray(source.highlights) ? source.highlights : [];
  if (highlights.length > 0) {
    lines.push('', '## Highlights', '');
    highlights
      .filter((highlight) => typeof highlight?.text === 'string' && highlight.text.trim())
      .forEach((highlight, highlightIndex) => {
        const score = Number.isFinite(highlight.score) ? highlight.score.toFixed(2) : '1.00';
        lines.push(`### Highlight ${highlightIndex + 1} [Relevance: ${score}]`);
        lines.push('', '```text', highlight.text.trim(), '```', '');
      });
  }
  lines.push('');
  return lines.join('\n');
}

function buildReferences(results) {
  const references = [];
  for (const source of [...(results.organic ?? []), ...(results.topStories ?? [])]) {
    if (!source?.link) {
      continue;
    }
    references.push({
      type: 'link',
      link: source.link,
      title: source.title,
      attribution: source.attribution || getDomain(source.link),
    });
  }
  return references;
}

function formatResultsForLLM(turn, results) {
  const output = [];
  const organic = results.organic ?? [];
  const topStories = results.topStories ?? [];
  if (organic.length > 0) {
    output.push(`=== Web Results, Turn ${turn} ===`, '');
    organic.forEach((source, index) => {
      output.push(formatSource(source, index, turn, 'search'));
    });
  }
  if (topStories.length > 0) {
    output.push('=== News Results ===', '');
    topStories.forEach((source, index) => {
      output.push(formatSource(source, index, turn, 'news'));
    });
  }
  if (output.length === 0) {
    output.push('No web search results were returned.');
  }
  return {
    output: output.join('\n').trim(),
    references: buildReferences(results),
  };
}

async function callLocalWebSearch({
  url,
  token,
  query,
  images,
  videos,
  news,
  timeout,
  maxResults,
}) {
  const endpoint = new URL('/search-and-scrape', assertLocalUrl(url));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        query,
        max_results: maxResults,
        scrape: true,
        category: news ? 'news' : images ? 'images' : videos ? 'videos' : 'general',
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Local web search returned ${response.status}: ${text.slice(0, 500)}`);
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

function createLocalWebSearchTool({
  localWebSearchUrl,
  localWebSearchToken,
  localWebSearchTimeout = 60000,
  localWebSearchMaxResults = 5,
  onSearchResults,
}) {
  if (!localWebSearchUrl) {
    throw new Error('LOCAL_WEB_SEARCH_URL is required for local web search');
  }

  return tool(
    async (rawParams, runnableConfig) => {
      const params = rawParams ?? {};
      const query = typeof params.query === 'string' ? params.query : '';
      const results = await callLocalWebSearch({
        query,
        url: localWebSearchUrl,
        token: localWebSearchToken,
        images: params.images === true,
        videos: params.videos === true,
        news: params.news === true,
        timeout: localWebSearchTimeout,
        maxResults: localWebSearchMaxResults,
      });
      const turn = runnableConfig.toolCall?.turn ?? 0;
      const data = { turn, ...results };
      onSearchResults?.({ success: true, data }, runnableConfig);
      const { output, references } = formatResultsForLLM(turn, data);
      return [output, { [Tools.web_search]: { ...data, references } }];
    },
    {
      name: WebSearchToolName,
      description:
        'Search the web and scrape result pages through the local LibreChat web search helper.',
      schema,
      responseFormat: Constants.CONTENT_AND_ARTIFACT,
    },
  );
}

module.exports = {
  createLocalWebSearchTool,
};
