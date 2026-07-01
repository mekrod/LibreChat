import { useEffect, useMemo, useState } from 'react';
import { Button, OGDialog, OGDialogTemplate } from '@librechat/client';
import {
  AuthType,
  RerankerTypes,
  SearchProviders,
  ScraperProviders,
  SearchCategories,
} from 'librechat-data-provider';
import type { SearchApiKeyFormData } from '~/hooks/Plugins/useAuthSearchTool';
import type { UseFormRegister, UseFormHandleSubmit, UseFormSetValue } from 'react-hook-form';
import InputSection, { type DropdownOption } from './InputSection';
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize } from '~/hooks';

export default function ApiKeyDialog({
  isOpen,
  onSubmit,
  onRevoke,
  onOpenChange,
  authTypes,
  isToolAuthenticated,
  register,
  setValue,
  handleSubmit,
  triggerRef,
  triggerRefs,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: SearchApiKeyFormData) => void;
  onRevoke: () => void;
  authTypes: [string, AuthType][];
  isToolAuthenticated: boolean;
  register: UseFormRegister<SearchApiKeyFormData>;
  setValue?: UseFormSetValue<SearchApiKeyFormData>;
  handleSubmit: UseFormHandleSubmit<SearchApiKeyFormData>;
  triggerRef?: React.RefObject<HTMLInputElement | HTMLButtonElement>;
  triggerRefs?: React.RefObject<HTMLInputElement | HTMLButtonElement>[];
}) {
  const localize = useLocalize();
  const { data: config } = useGetStartupConfig();

  const [webSearchMode, setWebSearchMode] = useState<'local' | 'legacy'>('local');
  const [selectedProvider, setSelectedProvider] = useState<SearchProviders>(
    config?.webSearch?.searchProvider && config.webSearch.searchProvider !== SearchProviders.LOCAL
      ? config.webSearch.searchProvider
      : SearchProviders.SERPER,
  );
  const [selectedReranker, setSelectedReranker] = useState<RerankerTypes>(
    config?.webSearch?.rerankerType && config.webSearch.rerankerType !== RerankerTypes.NONE
      ? config.webSearch.rerankerType
      : RerankerTypes.JINA,
  );
  const [selectedScraper, setSelectedScraper] = useState<ScraperProviders>(
    config?.webSearch?.scraperProvider &&
      config.webSearch.scraperProvider !== ScraperProviders.LOCAL
      ? config.webSearch.scraperProvider
      : ScraperProviders.FIRECRAWL,
  );

  const providerOptions: DropdownOption[] = [
    {
      key: SearchProviders.SERPER,
      label: localize('com_ui_web_search_provider_serper'),
      inputs: {
        serperApiKey: {
          placeholder: localize('com_ui_enter_api_key'),
          type: 'password' as const,
          link: {
            url: 'https://serper.dev/api-keys',
            text: localize('com_ui_web_search_provider_serper_key'),
          },
        },
      },
    },
    {
      key: SearchProviders.SEARXNG,
      label: localize('com_ui_web_search_provider_searxng'),
      inputs: {
        searxngInstanceUrl: {
          placeholder: localize('com_ui_web_search_searxng_instance_url'),
          type: 'text' as const,
        },
        searxngApiKey: {
          placeholder: localize('com_ui_web_search_searxng_api_key'),
          type: 'password' as const,
        },
      },
    },
    {
      key: SearchProviders.TAVILY,
      label: localize('com_ui_web_search_provider_tavily'),
      inputs: {
        tavilyApiKey: {
          placeholder: localize('com_ui_enter_api_key'),
          type: 'password' as const,
          link: {
            url: 'https://app.tavily.com/home',
            text: localize('com_ui_web_search_provider_tavily_key'),
          },
        },
      },
    },
    {
      key: SearchProviders.LOCAL,
      label: localize('com_ui_web_search_provider_local'),
      inputs: {
        localWebSearchUrl: {
          placeholder: localize('com_ui_web_search_local_url'),
          type: 'text' as const,
        },
        localWebSearchToken: {
          placeholder: localize('com_ui_web_search_local_token'),
          type: 'password' as const,
        },
      },
    },
  ];
  const legacyProviderOptions = useMemo(
    () => providerOptions.filter((option) => option.key !== SearchProviders.LOCAL),
    [providerOptions],
  );

  const rerankerOptions: DropdownOption[] = [
    {
      key: RerankerTypes.JINA,
      label: localize('com_ui_web_search_reranker_jina'),
      inputs: {
        jinaApiKey: {
          placeholder: localize('com_ui_web_search_jina_key'),
          type: 'password' as const,
          link: {
            url: 'https://jina.ai/api-dashboard/',
            text: localize('com_ui_web_search_reranker_jina_key'),
          },
        },
        jinaApiUrl: {
          placeholder: localize('com_ui_web_search_jina_url'),
          type: 'text' as const,
          link: {
            url: 'https://api.jina.ai/v1/rerank',
            text: localize('com_ui_web_search_reranker_jina_url_help'),
          },
        },
      },
    },
    {
      key: RerankerTypes.COHERE,
      label: localize('com_ui_web_search_reranker_cohere'),
      inputs: {
        cohereApiKey: {
          placeholder: localize('com_ui_web_search_cohere_key'),
          type: 'password' as const,
          link: {
            url: 'https://dashboard.cohere.com/welcome/login',
            text: localize('com_ui_web_search_reranker_cohere_key'),
          },
        },
      },
    },
  ];

  const scraperOptions: DropdownOption[] = [
    {
      key: ScraperProviders.FIRECRAWL,
      label: localize('com_ui_web_search_scraper_firecrawl'),
      inputs: {
        firecrawlApiUrl: {
          placeholder: localize('com_ui_web_search_firecrawl_url'),
          type: 'text' as const,
        },
        firecrawlApiKey: {
          placeholder: localize('com_ui_enter_api_key'),
          type: 'password' as const,
          link: {
            url: 'https://docs.firecrawl.dev/introduction#api-key',
            text: localize('com_ui_web_search_scraper_firecrawl_key'),
          },
        },
      },
    },
    {
      key: ScraperProviders.SERPER,
      label: localize('com_ui_web_search_scraper_serper'),
      inputs: {
        serperApiKey: {
          placeholder: localize('com_ui_enter_api_key'),
          type: 'password' as const,
          link: {
            url: 'https://serper.dev/api-keys',
            text: localize('com_ui_web_search_scraper_serper_key'),
          },
        },
      },
    },
    {
      key: ScraperProviders.TAVILY,
      label: localize('com_ui_web_search_scraper_tavily'),
      inputs: {
        tavilyApiKey: {
          placeholder: localize('com_ui_enter_api_key'),
          type: 'password' as const,
          link: {
            url: 'https://app.tavily.com/home',
            text: localize('com_ui_web_search_scraper_tavily_key'),
          },
        },
      },
    },
    {
      key: ScraperProviders.LOCAL,
      label: localize('com_ui_web_search_scraper_local'),
      inputs: {
        localWebSearchUrl: {
          placeholder: localize('com_ui_web_search_local_url'),
          type: 'text' as const,
        },
        localWebSearchToken: {
          placeholder: localize('com_ui_web_search_local_token'),
          type: 'password' as const,
        },
      },
    },
  ];
  const legacyScraperOptions = useMemo(
    () => scraperOptions.filter((option) => option.key !== ScraperProviders.LOCAL),
    [scraperOptions],
  );

  const [dropdownOpen, setDropdownOpen] = useState({
    provider: false,
    reranker: false,
    scraper: false,
  });

  const providerAuthType = authTypes.find(([cat]) => cat === SearchCategories.PROVIDERS)?.[1];
  const scraperAuthType = authTypes.find(([cat]) => cat === SearchCategories.SCRAPERS)?.[1];
  const localProviderOption = providerOptions.find(
    (option) => option.key === SearchProviders.LOCAL,
  );
  const showLegacySettings = webSearchMode === 'legacy';
  const showProviderSection =
    showLegacySettings || providerAuthType !== AuthType.SYSTEM_DEFINED || webSearchMode === 'local';
  const showScraperSection = showLegacySettings || scraperAuthType !== AuthType.SYSTEM_DEFINED;

  useEffect(() => {
    if (!setValue) {
      return;
    }
    setValue('webSearchMode', webSearchMode);
    setValue(
      'selectedProvider',
      webSearchMode === 'local' ? SearchProviders.LOCAL : selectedProvider,
    );
    setValue(
      'selectedScraper',
      webSearchMode === 'local' ? ScraperProviders.LOCAL : selectedScraper,
    );
    setValue('selectedReranker', webSearchMode === 'local' ? RerankerTypes.NONE : selectedReranker);
  }, [selectedProvider, selectedReranker, selectedScraper, setValue, webSearchMode]);

  const handleProviderChange = (key: string) => {
    setSelectedProvider(key as SearchProviders);
  };

  const handleRerankerChange = (key: string) => {
    setSelectedReranker(key as RerankerTypes);
  };

  const handleScraperChange = (key: string) => {
    setSelectedScraper(key as ScraperProviders);
  };

  return (
    <OGDialog
      open={isOpen}
      onOpenChange={onOpenChange}
      triggerRef={triggerRef}
      triggerRefs={triggerRefs}
    >
      <OGDialogTemplate
        className="w-11/12 sm:w-[500px]"
        title=""
        main={
          <>
            <div className="mb-4 text-center font-medium">{localize('com_ui_web_search')}</div>
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="mb-6 grid grid-cols-2 rounded-md border border-border-light p-1">
                <button
                  type="button"
                  className={`rounded px-3 py-2 text-sm transition-colors ${
                    webSearchMode === 'local'
                      ? 'bg-surface-secondary text-text-primary'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                  onClick={() => setWebSearchMode('local')}
                >
                  {localize('com_ui_web_search_mode_local')}
                </button>
                <button
                  type="button"
                  className={`rounded px-3 py-2 text-sm transition-colors ${
                    webSearchMode === 'legacy'
                      ? 'bg-surface-secondary text-text-primary'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                  onClick={() => setWebSearchMode('legacy')}
                >
                  {localize('com_ui_web_search_mode_legacy')}
                </button>
              </div>

              {/* Provider Section */}
              {webSearchMode === 'local' && localProviderOption && (
                <InputSection
                  title={localize('com_ui_web_search_provider')}
                  selectedKey={SearchProviders.LOCAL}
                  onSelectionChange={() => undefined}
                  dropdownOptions={[localProviderOption]}
                  showDropdown={false}
                  register={register}
                  dropdownOpen={false}
                  setDropdownOpen={() => undefined}
                  dropdownKey="provider"
                />
              )}

              {showLegacySettings && showProviderSection && (
                <InputSection
                  title={localize('com_ui_web_search_provider')}
                  selectedKey={selectedProvider}
                  onSelectionChange={handleProviderChange}
                  dropdownOptions={legacyProviderOptions}
                  showDropdown={true}
                  register={register}
                  dropdownOpen={dropdownOpen.provider}
                  setDropdownOpen={(open) =>
                    setDropdownOpen((prev) => ({ ...prev, provider: open }))
                  }
                  dropdownKey="provider"
                />
              )}

              {/* Scraper Section */}
              {showLegacySettings && showScraperSection && (
                <InputSection
                  title={localize('com_ui_web_search_scraper')}
                  selectedKey={selectedScraper}
                  onSelectionChange={handleScraperChange}
                  dropdownOptions={legacyScraperOptions}
                  showDropdown={true}
                  register={register}
                  dropdownOpen={dropdownOpen.scraper}
                  setDropdownOpen={(open) =>
                    setDropdownOpen((prev) => ({ ...prev, scraper: open }))
                  }
                  dropdownKey="scraper"
                />
              )}

              {/* Reranker Section */}
              {showLegacySettings && (
                <InputSection
                  title={localize('com_ui_web_search_reranker')}
                  selectedKey={selectedReranker}
                  onSelectionChange={handleRerankerChange}
                  dropdownOptions={rerankerOptions}
                  showDropdown={!config?.webSearch?.rerankerType}
                  register={register}
                  dropdownOpen={dropdownOpen.reranker}
                  setDropdownOpen={(open) =>
                    setDropdownOpen((prev) => ({ ...prev, reranker: open }))
                  }
                  dropdownKey="reranker"
                />
              )}
            </form>
          </>
        }
        selection={{
          selectHandler: handleSubmit(onSubmit),
          selectClasses: 'bg-green-500 hover:bg-green-600 text-white',
          selectText: localize('com_ui_save'),
        }}
        buttons={
          isToolAuthenticated && (
            <Button
              onClick={onRevoke}
              className="bg-red-500 text-white hover:bg-red-600"
              aria-label={localize('com_ui_revoke')}
            >
              {localize('com_ui_revoke')}
            </Button>
          )
        }
        showCancelButton={true}
      />
    </OGDialog>
  );
}
