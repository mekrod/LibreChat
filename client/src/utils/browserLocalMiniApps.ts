import type { MiniAppFileMap } from 'librechat-data-provider';
import { parseAnyMiniAppBundle } from '~/components/MiniApps/runtime';

type BrowserLocalMiniAppBundle = {
  title: string;
  description?: string;
  entryFile?: string;
  files: MiniAppFileMap;
};

const FENCED_BLOCK_PATTERN = /```([^\n`]*)\n([\s\S]*?)```/g;
const FILE_PATH_PATTERN = /\b(?:file|filename|path)=["']?([^"'\s]+)["']?/i;
const FILE_PREFIX_PATTERN = /\bfile:([^\s]+)/i;
const DIRECT_APP_REQUEST_PATTERN =
  /\b(?:create|build|make|generate|prototype|develop|implement|code|write)\b[\s\S]{0,140}\b(?:an?\s+)?(?:app|application|mini\s*-?\s*app|dashboard|tracker|planner|calculator|game|crud|workspace|notion[-\s]?like|kanban|todo|timer|calendar|form|interactive\s+tool)\b/i;
const POLITE_APP_REQUEST_PATTERN =
  /\b(?:can|could|would)\s+you\b[\s\S]{0,80}\b(?:create|build|make|generate|prototype|develop|implement|code|write)\b[\s\S]{0,140}\b(?:an?\s+)?(?:app|application|mini\s*-?\s*app|dashboard|tracker|planner|calculator|game|crud|workspace|notion[-\s]?like|kanban|todo|timer|calendar|form|interactive\s+tool)\b/i;
const WANTED_APP_PATTERN =
  /\b(?:i\s+(?:need|want)|give\s+me|please)\b[\s\S]{0,100}\b(?:an?\s+)?(?:app|application|mini\s*-?\s*app|dashboard|tracker|planner|calculator|game|crud|workspace|notion[-\s]?like|kanban|todo|timer|calendar|form|interactive\s+tool)\b/i;
const INFORMATIONAL_START_PATTERN =
  /^\s*(?:what|why|how|when|where|who|explain|describe|tell\s+me|does|do|is|are)\b/i;
const NON_USER_CAPABILITY_QUESTION_PATTERN =
  /^\s*(?:can|could|would)\s+(?!you\b)[\s\S]{0,80}\b(?:create|build|make|generate|prototype|develop|implement|code|write)\b/i;

function titleFromUserRequest(text: string): string {
  const title = text
    .replace(/[^\w\s-]/g, ' ')
    .replace(
      /\b(?:please|can|could|would|you|create|build|make|generate|prototype|develop|implement|code|write|an|a|the|app|application|mini|dashboard|tracker|planner|calculator|game|crud|tool)\b/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48);

  if (!title) {
    return 'Browser Local App';
  }

  return title.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeFilePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
}

function getFenceFilePath(info: string): string | null {
  const fileAttribute = info.match(FILE_PATH_PATTERN);
  if (fileAttribute?.[1]) {
    return normalizeFilePath(fileAttribute[1]);
  }

  const filePrefix = info.match(FILE_PREFIX_PATTERN);
  if (filePrefix?.[1]) {
    return normalizeFilePath(filePrefix[1]);
  }

  return null;
}

function languageFromPath(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'css':
      return 'css';
    case 'json':
      return 'json';
    case 'ts':
    case 'tsx':
      return extension;
    case 'js':
    case 'jsx':
      return extension;
    case 'html':
      return 'html';
    case 'md':
      return 'markdown';
    default:
      return 'text';
  }
}

function inferEntryFile(files: MiniAppFileMap, entryFile?: string): string {
  if (entryFile && files[entryFile]) {
    return entryFile;
  }

  return (
    [
      'src/index.jsx',
      'src/index.tsx',
      'src/main.jsx',
      'src/main.tsx',
      'src/App.jsx',
      'src/App.tsx',
      'index.jsx',
      'index.tsx',
      'App.jsx',
      'App.tsx',
    ].find((path) => files[path]) ??
    Object.keys(files)[0] ??
    'src/index.jsx'
  );
}

function normalizeFiles(files: MiniAppFileMap): MiniAppFileMap {
  return Object.fromEntries(
    Object.entries(files)
      .map(([path, content]) => [normalizeFilePath(path), content.trimEnd()])
      .filter(([path, content]) => path.length > 0 && content.trim().length > 0),
  );
}

function parseLooseFileBundle(raw: string, userRequest: string): BrowserLocalMiniAppBundle | null {
  const files: MiniAppFileMap = {};

  for (const block of raw.matchAll(FENCED_BLOCK_PATTERN)) {
    const info = (block[1] ?? '').trim();
    const filePath = getFenceFilePath(info);
    if (!filePath) {
      continue;
    }

    files[filePath] = block[2] ?? '';
  }

  const normalizedFiles = normalizeFiles(files);
  if (Object.keys(normalizedFiles).length === 0) {
    return null;
  }

  const title = titleFromUserRequest(userRequest);
  return {
    title,
    description: `Generated ${title} mini app`,
    entryFile: inferEntryFile(normalizedFiles),
    files: normalizedFiles,
  };
}

function serializeMiniAppBundle(bundle: BrowserLocalMiniAppBundle): string {
  const files = normalizeFiles(bundle.files);
  const entryFile = inferEntryFile(files, bundle.entryFile);
  const manifest = JSON.stringify(
    {
      title: bundle.title || 'Browser Local App',
      description:
        bundle.description || `Generated ${bundle.title || 'Browser Local App'} mini app`,
      entryFile,
    },
    null,
    2,
  );

  const fileBlocks = Object.entries(files).map(([path, content]) =>
    [`\`\`\`${languageFromPath(path)} file="${path}"`, content, '```'].join('\n'),
  );

  return [`\`\`\`miniapp\n${manifest}\n\`\`\``, ...fileBlocks].join('\n\n');
}

export function isBrowserLocalMiniAppRequest(text?: string | null): boolean {
  if (!text) {
    return false;
  }

  if (POLITE_APP_REQUEST_PATTERN.test(text)) {
    return true;
  }

  if (INFORMATIONAL_START_PATTERN.test(text)) {
    return false;
  }

  if (NON_USER_CAPABILITY_QUESTION_PATTERN.test(text)) {
    return false;
  }

  return DIRECT_APP_REQUEST_PATTERN.test(text) || WANTED_APP_PATTERN.test(text);
}

export function hasBrowserLocalMiniAppBundle(text: string): boolean {
  try {
    parseAnyMiniAppBundle(text);
    return true;
  } catch {
    return false;
  }
}

export function normalizeBrowserLocalMiniAppResponse(
  text: string,
  userRequest?: string | null,
): string | null {
  const request = userRequest ?? '';

  try {
    return serializeMiniAppBundle(parseAnyMiniAppBundle(text));
  } catch {
    const looseBundle = parseLooseFileBundle(text, request);
    return looseBundle ? serializeMiniAppBundle(looseBundle) : null;
  }
}
