import type { TConfig, TEndpointsConfig } from 'librechat-data-provider';

export const browserLocalEndpoint = 'browserLocal';
export const browserLocalModel = 'google/gemma-4-E2B-it-qat-mobile-transformers';

export const browserLocalConfig: TConfig = {
  order: 1000,
  name: 'Browser Local',
  iconURL: 'google',
  modelDisplayLabel: 'Gemma 4 E2B',
};

export function withBrowserLocalEndpoint(endpointsConfig?: TEndpointsConfig): TEndpointsConfig {
  return {
    ...(endpointsConfig ?? {}),
    [browserLocalEndpoint]: browserLocalConfig,
  };
}

export function isBrowserLocalEndpoint(endpoint?: string | null): boolean {
  return endpoint === browserLocalEndpoint;
}
