import { browserLocalModel } from './browserLocal';

export type BrowserLocalChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type BrowserLocalProgress = {
  status: string;
  kind?: 'bytes' | 'tensors';
  message?: string;
  loaded?: number;
  total?: number | null;
  fraction?: number;
  fromCache?: boolean;
};

export type Gemma4Mobile = {
  generate: (
    messages: BrowserLocalChatMessage[],
    options?: { maxNewTokens?: number; signal?: AbortSignal },
  ) => AsyncIterable<{ text: string; delta: string; token: number }>;
  complete: (
    messages: BrowserLocalChatMessage[],
    options?: { maxNewTokens?: number; signal?: AbortSignal },
  ) => Promise<string>;
  warmup: () => Promise<void>;
  reset: () => void;
  dispose: () => void;
};

type GemmaModule = {
  Gemma4Mobile: {
    load: (
      model?: string | null,
      options?: {
        onProgress?: (progress: BrowserLocalProgress) => void;
        runtimeOptions?: { disabledFeatures?: string[] };
        signal?: AbortSignal;
      },
    ) => Promise<Gemma4Mobile>;
  };
};

let modelPromise: Promise<Gemma4Mobile> | null = null;

const modulePath = '/browser-local/gemma-4-e2b.js?v=a632b11-disable-subgroups';
const disabledWebGPUFeatures = ['subgroups', 'chromium-experimental-subgroup-matrix'];

function formatInteger(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  let digits = 1;
  if (unit === 3) {
    digits = 2;
  } else if (value >= 10 || unit === 0) {
    digits = 0;
  }
  return `${value.toFixed(digits)} ${units[unit]}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function getBrowserLocalProgressText(progress: BrowserLocalProgress): string {
  if (progress.status === 'init') {
    return 'Requesting WebGPU device...';
  }

  if (progress.status === 'tokenizer') {
    return 'Loading tokenizer...';
  }

  if (progress.status !== 'weights') {
    return progress.message ?? 'Loading browser local model...';
  }

  const loaded = isFiniteNumber(progress.loaded) ? progress.loaded : null;
  const total = isFiniteNumber(progress.total) ? progress.total : null;
  const percent = isFiniteNumber(progress.fraction)
    ? ` (${Math.round(progress.fraction * 100)}%)`
    : '';

  if (progress.kind === 'bytes') {
    const verb = progress.fromCache ? 'Loading cached weights' : 'Downloading weights';
    if (loaded != null && total != null) {
      return `${verb}: ${formatBytes(loaded)} / ${formatBytes(total)}${percent}`;
    }
    if (total != null) {
      return `${verb}: ${formatBytes(total)} total`;
    }
    return `${verb}...`;
  }

  if (loaded != null && total != null) {
    return `Preparing GPU weights: ${formatInteger(loaded)} / ${formatInteger(total)} tensors${percent}`;
  }

  return progress.message ?? 'Preparing GPU weights...';
}

async function importGemmaModule(): Promise<GemmaModule> {
  const moduleUrl =
    typeof window === 'undefined' ? modulePath : new URL(modulePath, window.location.origin).href;

  return import(/* @vite-ignore */ moduleUrl) as Promise<GemmaModule>;
}

export async function loadBrowserLocalGemma({
  signal,
  onProgress,
}: {
  signal?: AbortSignal;
  onProgress?: (progress: BrowserLocalProgress) => void;
}): Promise<Gemma4Mobile> {
  if (!('gpu' in navigator)) {
    throw new Error('WebGPU is not available in this browser.');
  }

  if (!modelPromise) {
    modelPromise = (async () => {
      const mod = await importGemmaModule();
      const model = await mod.Gemma4Mobile.load(browserLocalModel, {
        signal,
        onProgress,
        runtimeOptions: { disabledFeatures: disabledWebGPUFeatures },
      });
      onProgress?.({ status: 'warmup', message: 'Warming up kernels...' });
      await model.warmup();
      onProgress?.({ status: 'ready', message: 'Ready.', fraction: 1 });
      return model;
    })().catch((error: unknown) => {
      modelPromise = null;
      throw error;
    });
  }

  return modelPromise;
}
