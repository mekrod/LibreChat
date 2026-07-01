import { memo, useCallback, useMemo, useState } from 'react';
import { AppWindow, ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import { useRecoilState } from 'recoil';
import type { TMiniAppSummary } from 'librechat-data-provider';
import type { ChangeEvent, MouseEvent } from 'react';
import type { MiniAppCustomizationAction } from '~/store/families';
import MiniAppPreview from '~/components/MiniApps/Preview';
import { useMiniAppsInfiniteQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import store from '~/store';
import { cn } from '~/utils';

type Option = {
  value: MiniAppCustomizationAction;
  labelKey: 'com_ui_mini_apps_add_feature' | 'com_ui_mini_apps_erase_feature';
};

const actionOptions: Option[] = [
  { value: 'add_feature', labelKey: 'com_ui_mini_apps_add_feature' },
  { value: 'erase_feature', labelKey: 'com_ui_mini_apps_erase_feature' },
];

function findSelectedMiniApp(miniApps: TMiniAppSummary[], miniAppId: string | null) {
  if (!miniAppId) {
    return null;
  }
  return miniApps.find((miniApp) => miniApp._id === miniAppId) ?? null;
}

function MiniAppCustomizationFields({ index }: { index: number }) {
  const localize = useLocalize();
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [customization, setCustomization] = useRecoilState(
    store.miniAppCustomizationByIndex(index),
  );
  const { data, isLoading } = useMiniAppsInfiniteQuery(
    { limit: 50 },
    { enabled: customization.enabled },
  );
  const miniApps = useMemo(() => data?.pages.flatMap((page) => page.miniApps) ?? [], [data]);
  const selectedMiniApp = useMemo(
    () => findSelectedMiniApp(miniApps, customization.miniAppId),
    [miniApps, customization.miniAppId],
  );

  const close = useCallback(() => {
    setCustomization((current) => ({ ...current, enabled: false }));
  }, [setCustomization]);

  const selectMiniApp = useCallback(
    (miniAppId: string) => {
      const miniApp = findSelectedMiniApp(miniApps, miniAppId);
      setCustomization((current) => ({
        ...current,
        enabled: true,
        miniAppId: miniApp?._id ?? miniAppId,
        miniAppTitle: miniApp?.title ?? '',
        miniAppDescription: miniApp?.description,
      }));
      setAppMenuOpen(false);
    },
    [miniApps, setCustomization],
  );

  const selectAction = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      setCustomization((current) => ({
        ...current,
        action: event.target.value as MiniAppCustomizationAction,
      }));
    },
    [setCustomization],
  );

  if (!customization.enabled) {
    return null;
  }

  const stopComposerFocus = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  const previewId = selectedMiniApp?._id ?? customization.miniAppId;
  const previewTitle = selectedMiniApp?.title ?? customization.miniAppTitle;
  const hasSelection = Boolean(previewId);

  return (
    <div
      className="relative flex flex-col gap-2 border-b border-border-light px-3 py-2"
      aria-label={localize('com_ui_mini_apps_customize')}
      onMouseDown={stopComposerFocus}
      onClick={stopComposerFocus}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-text-primary">
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-cyan-500" aria-hidden="true" />
          <span className="truncate">{localize('com_ui_mini_apps_customize')}</span>
        </div>
        <button
          type="button"
          aria-label={localize('com_ui_close')}
          onClick={close}
          className="rounded-full p-1 text-text-secondary hover:bg-surface-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(11rem,0.65fr)]">
        <div className="relative flex min-w-0 flex-col gap-1 text-xs font-medium text-text-secondary">
          <span>{localize('com_ui_mini_apps_select')}</span>
          <button
            type="button"
            onClick={() => setAppMenuOpen((open) => !open)}
            disabled={isLoading}
            aria-expanded={appMenuOpen}
            aria-haspopup="listbox"
            className="flex min-h-14 w-full items-center gap-2 rounded-md border border-border-light bg-surface-secondary px-2 py-2 text-left text-sm text-text-primary outline-none transition-colors hover:bg-surface-tertiary focus:border-border-medium disabled:cursor-not-allowed disabled:opacity-60"
          >
            {previewId ? (
              <MiniAppPreview miniAppId={previewId} className="w-20 shrink-0 rounded-md p-1.5" />
            ) : (
              <span className="flex h-12 w-20 shrink-0 items-center justify-center rounded-md border border-border-light bg-surface-primary">
                <AppWindow className="h-4 w-4 text-text-secondary" aria-hidden="true" />
              </span>
            )}
            <span className="min-w-0 flex-1 truncate">
              {previewTitle || localize('com_ui_mini_apps_select')}
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-text-secondary transition-transform',
                appMenuOpen && 'rotate-180',
              )}
              aria-hidden="true"
            />
          </button>
          {appMenuOpen ? (
            <div
              role="listbox"
              className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-border-light bg-surface-secondary p-1 shadow-lg"
            >
              {miniApps.map((miniApp) => (
                <button
                  key={miniApp._id}
                  type="button"
                  role="option"
                  aria-selected={customization.miniAppId === miniApp._id}
                  onClick={() => selectMiniApp(miniApp._id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-text-primary hover:bg-surface-tertiary',
                    customization.miniAppId === miniApp._id && 'bg-surface-tertiary',
                  )}
                >
                  <MiniAppPreview
                    miniAppId={miniApp._id}
                    className="w-20 shrink-0 rounded-md p-1.5"
                  />
                  <span className="min-w-0 flex-1 truncate">{miniApp.title}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-text-secondary">
          {localize('com_ui_mini_apps_feature_action')}
          <select
            value={customization.action}
            onChange={selectAction}
            onFocus={() => setAppMenuOpen(false)}
            className="h-14 rounded-md border border-border-light bg-surface-secondary px-2 text-sm text-text-primary outline-none transition-colors hover:bg-surface-tertiary focus:border-border-medium"
          >
            {actionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {localize(option.labelKey)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="text-xs text-text-secondary">
        {hasSelection
          ? localize(
              customization.action === 'add_feature'
                ? 'com_ui_mini_apps_add_feature_hint'
                : 'com_ui_mini_apps_erase_feature_hint',
            )
          : localize('com_ui_mini_apps_select_hint')}
      </div>
    </div>
  );
}

export default memo(MiniAppCustomizationFields);
