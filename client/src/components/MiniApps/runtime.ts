import type { MiniAppFileInput, MiniAppFileMap } from 'librechat-data-provider';

export type ParsedMiniAppBundle = {
  title: string;
  description?: string;
  entryFile?: string;
  files: MiniAppFileMap;
};

const FILE_EXTENSION_PATTERN = /\.(jsx?|tsx?|css|json|html|md)$/i;
const FENCED_BLOCK_PATTERN = /```([^\n`]*)\n([\s\S]*?)```/g;
const RUNTIME_ENTRY_PATTERN = /^\/(?:src\/)?(?:index|main)\.(?:jsx?|tsx?)$/i;
const REACT_COMPONENT_PATTERN = /\.(?:jsx?|tsx?)$/i;
const RUNTIME_ENTRY_CANDIDATES = [
  '/src/index.jsx',
  '/src/index.tsx',
  '/src/index.js',
  '/src/index.ts',
  '/src/main.jsx',
  '/src/main.tsx',
  '/src/main.js',
  '/src/main.ts',
  '/index.jsx',
  '/index.tsx',
  '/index.js',
  '/index.ts',
];

export function parseMiniAppBundle(raw: string): ParsedMiniAppBundle {
  const trimmed = raw.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const parsed = JSON.parse(unfenced) as ParsedMiniAppBundle;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid mini app bundle');
  }
  if (!parsed.title || typeof parsed.title !== 'string') {
    throw new Error('Mini app title is required');
  }
  if (!parsed.files || typeof parsed.files !== 'object' || Array.isArray(parsed.files)) {
    throw new Error('Mini app files are required');
  }
  const files = normalizeParsedFiles(parsed.files);
  if (Object.keys(files).length === 0) {
    throw new Error('Mini app files are required');
  }
  return { ...parsed, files };
}

type MiniAppManifest = {
  title?: unknown;
  description?: unknown;
  entryFile?: unknown;
};

function getTagContent(raw: string, tagName: string): string | null {
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = raw.match(pattern);
  return match?.[1]?.trim() ?? null;
}

function titleFromName(name: string): string {
  return name
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function stripRootPrefix(path: string, root: string): string {
  if (path === root) {
    return '';
  }
  if (path.startsWith(`${root}/`)) {
    return path.slice(root.length + 1);
  }
  return path;
}

function stripCommonRoot(files: MiniAppFileMap): MiniAppFileMap {
  const paths = Object.keys(files);
  const firstSegments = paths
    .map((path) => path.split('/')[0])
    .filter((segment) => segment && segment !== 'src' && !FILE_EXTENSION_PATTERN.test(segment));
  const root = firstSegments[0];

  if (!root || !paths.every((path) => path === root || path.startsWith(`${root}/`))) {
    return files;
  }

  return Object.fromEntries(
    Object.entries(files)
      .map(([path, content]) => [stripRootPrefix(path, root), content])
      .filter(([path]) => path),
  );
}

function normalizeParsedFiles(files: MiniAppFileMap): MiniAppFileMap {
  return Object.fromEntries(
    Object.entries(files)
      .map(([path, content]) => [
        path.replace(/\\/g, '/').replace(/^\/+/, ''),
        typeof content === 'string' ? content.replace(/\s+$/g, '') : '',
      ])
      .filter(([path, content]) => path && content.trim().length > 0),
  );
}

function inferEntryFile(files: MiniAppFileMap): string {
  const candidates = [
    'src/App.jsx',
    'src/App.tsx',
    'src/main.jsx',
    'src/main.tsx',
    'src/index.jsx',
    'src/index.tsx',
    'App.jsx',
    'App.tsx',
  ];
  return candidates.find((path) => files[path] != null) ?? Object.keys(files)[0] ?? 'src/App.jsx';
}

function parsePackageTitle(files: MiniAppFileMap, fallback: string): string {
  const packageJson = files['package.json'];
  if (!packageJson) {
    return titleFromName(fallback);
  }

  try {
    const parsed = JSON.parse(packageJson) as { name?: unknown };
    return typeof parsed.name === 'string' ? titleFromName(parsed.name) : titleFromName(fallback);
  } catch {
    return titleFromName(fallback);
  }
}

function getFenceFilePath(info: string): string | null {
  const fileAttribute = info.match(/\b(?:file|filename|path)=["']?([^"'\s]+)["']?/i);
  if (fileAttribute?.[1]) {
    return fileAttribute[1].replace(/\\/g, '/').replace(/^\/+/, '');
  }

  const filePrefix = info.match(/\bfile:([^\s]+)/i);
  if (filePrefix?.[1]) {
    return filePrefix[1].replace(/\\/g, '/').replace(/^\/+/, '');
  }

  return null;
}

export function parseMiniAppFileBlocks(raw: string): ParsedMiniAppBundle {
  const blocks = [...raw.matchAll(FENCED_BLOCK_PATTERN)];
  let manifest: MiniAppManifest | null = null;
  const files: MiniAppFileMap = {};

  for (const block of blocks) {
    const info = (block[1] ?? '').trim();
    const content = block[2] ?? '';
    const lowerInfo = info.toLowerCase();

    if (lowerInfo === 'miniapp' || lowerInfo === 'mini-app' || lowerInfo.includes('miniapp')) {
      manifest = JSON.parse(content.trim()) as MiniAppManifest;
      continue;
    }

    const filePath = getFenceFilePath(info);
    if (filePath) {
      files[filePath] = content;
    }
  }

  const normalizedFiles = stripCommonRoot(normalizeParsedFiles(files));
  if (!manifest || Object.keys(normalizedFiles).length === 0) {
    throw new Error('Invalid separated mini app bundle');
  }

  const entryFile =
    typeof manifest.entryFile === 'string' ? manifest.entryFile : inferEntryFile(normalizedFiles);
  const fallbackTitle = parsePackageTitle(normalizedFiles, 'Mini app');
  const title = typeof manifest.title === 'string' ? manifest.title : fallbackTitle;

  return {
    title,
    description: typeof manifest.description === 'string' ? manifest.description : '',
    entryFile,
    files: normalizedFiles,
  };
}

export function parseMiniAppToolCalls(raw: string): ParsedMiniAppBundle {
  const toolCalls = [...raw.matchAll(/<tool_call>([\s\S]*?)<\/tool_call>/gi)];
  const files: MiniAppFileMap = {};
  let fallbackTitle = 'Mini app';

  for (const match of toolCalls) {
    const toolCall = match[1] ?? '';
    const toolName = getTagContent(toolCall, 'tool_name');
    if (toolName !== 'create_file') {
      continue;
    }

    const filePath = getTagContent(toolCall, 'file_path')?.replace(/\\/g, '/');
    const fileContent = getTagContent(toolCall, 'file_content');
    if (!filePath || fileContent == null) {
      continue;
    }

    fallbackTitle = filePath.split('/')[0] || fallbackTitle;
    files[filePath.replace(/^\/+/, '')] = fileContent;
  }

  const normalizedFiles = stripCommonRoot(normalizeParsedFiles(files));
  if (Object.keys(normalizedFiles).length === 0) {
    throw new Error('No mini app files found');
  }

  const entryFile = inferEntryFile(normalizedFiles);
  const title = parsePackageTitle(normalizedFiles, fallbackTitle);
  return {
    title,
    description: `Generated ${title} mini app`,
    entryFile,
    files: normalizedFiles,
  };
}

export function parseAnyMiniAppBundle(raw: string): ParsedMiniAppBundle {
  try {
    return parseMiniAppFileBlocks(raw);
  } catch {
    // Continue to legacy supported model output shapes.
  }

  try {
    return parseMiniAppBundle(raw);
  } catch {
    // Continue to other supported model output shapes.
  }

  const jsonBlocks = [...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  for (const block of jsonBlocks) {
    try {
      return parseMiniAppBundle(block[1] ?? '');
    } catch {
      // Try the next block.
    }
  }

  return parseMiniAppToolCalls(raw);
}

export function getMiniAppBundleStorageKey(raw: string): string {
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  }

  return `librechat-mini-app:${Math.abs(hash).toString(36)}:${raw.length}`;
}

function toSandpackPath(path: string): string {
  return `/${path.replace(/\\/g, '/').replace(/^\/+/, '')}`;
}

function toMiniAppFileEntries(files: MiniAppFileInput): Array<[string, string]> {
  if (Array.isArray(files)) {
    return files
      .filter((file) => typeof file.path === 'string' && typeof file.content === 'string')
      .map((file) => [file.path, file.content]);
  }

  return Object.entries(files);
}

function getRelativeImportPath(fromFile: string, targetFile: string): string {
  const fromParts = fromFile.replace(/^\/+/, '').split('/').slice(0, -1);
  const targetParts = targetFile.replace(/^\/+/, '').split('/');
  let sharedIndex = 0;

  while (
    sharedIndex < fromParts.length &&
    sharedIndex < targetParts.length &&
    fromParts[sharedIndex] === targetParts[sharedIndex]
  ) {
    sharedIndex++;
  }

  const parentSegments = fromParts.slice(sharedIndex).map(() => '..');
  const childSegments = targetParts.slice(sharedIndex);
  const relativePath = [...parentSegments, ...childSegments].join('/');
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
}

function hasRuntimeEntry(files: Record<string, string>): boolean {
  return files['/index.html'] != null || getSandpackRuntimeEntry(files) != null;
}

function getReactComponentEntry(files: Record<string, string>, entryFile?: string): string | null {
  const preferredEntry = entryFile ? toSandpackPath(entryFile) : null;
  if (
    preferredEntry &&
    files[preferredEntry] != null &&
    REACT_COMPONENT_PATTERN.test(preferredEntry) &&
    !RUNTIME_ENTRY_PATTERN.test(preferredEntry)
  ) {
    return preferredEntry;
  }

  return (
    ['/src/App.jsx', '/src/App.tsx', '/App.jsx', '/App.tsx'].find((path) => files[path] != null) ??
    null
  );
}

function createSandpackEntryFile(componentPath: string): [string, string] {
  const entryPath = componentPath.endsWith('.tsx') ? '/src/index.tsx' : '/src/index.js';
  const importPath = getRelativeImportPath(entryPath, componentPath);
  return [
    entryPath,
    [
      "import React from 'react';",
      "import { createRoot } from 'react-dom/client';",
      `import App from '${importPath}';`,
      '',
      "const root = document.getElementById('root');",
      'if (root) {',
      '  createRoot(root).render(<App />);',
      '}',
    ].join('\n'),
  ];
}

export function toSandpackFiles(
  files: MiniAppFileInput,
  entryFile?: string,
): Record<string, string> {
  const normalized = Object.fromEntries(
    toMiniAppFileEntries(files)
      .map(([path, content]) => [toSandpackPath(path), content.trimEnd()])
      .filter(([path, content]) => path !== '/' && content.length > 0),
  );
  const componentEntry = getReactComponentEntry(normalized, entryFile);

  if (componentEntry && !hasRuntimeEntry(normalized)) {
    const [generatedEntryPath, generatedEntryContent] = createSandpackEntryFile(componentEntry);
    return {
      ...normalized,
      [generatedEntryPath]: generatedEntryContent,
    };
  }

  if (hasRuntimeEntry(normalized)) {
    return normalized;
  }

  if (normalized['/src/App.jsx'] || normalized['/src/App.tsx']) {
    return normalized;
  }

  const firstPath = Object.keys(normalized)[0];
  return {
    ...normalized,
    '/src/App.jsx': firstPath
      ? normalized[firstPath]
      : 'export default function App() { return null; }',
  };
}

export function getSandpackActiveFile(entryFile: string): string {
  return toSandpackPath(entryFile);
}

export function getSandpackRuntimeEntry(
  files: Record<string, string>,
  entryFile?: string,
): string | undefined {
  const manifestEntry = entryFile ? toSandpackPath(entryFile) : undefined;

  if (manifestEntry && files[manifestEntry] != null && RUNTIME_ENTRY_PATTERN.test(manifestEntry)) {
    return manifestEntry;
  }

  return RUNTIME_ENTRY_CANDIDATES.find((candidate) => files[candidate] != null);
}
