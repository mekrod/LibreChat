import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AppWindow, Code2, LayoutGrid, Trash2 } from 'lucide-react';
import { Button, Spinner, useMediaQuery } from '@librechat/client';
import type { TMiniAppSummary } from 'librechat-data-provider';
import {
  useDeleteMiniAppMutation,
  useMiniAppQuery,
  useMiniAppsInfiniteQuery,
} from '~/data-provider';
import OpenSidebar from '~/components/Chat/Menus/OpenSidebar';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import MiniAppRunner from './MiniAppRunner';

const PREVIEW_STYLES = [
  {
    shell: 'bg-[#f7f3ea]',
    accent: 'bg-[#2563eb]',
    secondary: 'bg-[#f59e0b]',
    panel: 'bg-white',
  },
  {
    shell: 'bg-[#edf7f2]',
    accent: 'bg-[#059669]',
    secondary: 'bg-[#0f766e]',
    panel: 'bg-white',
  },
  {
    shell: 'bg-[#f6eef8]',
    accent: 'bg-[#7c3aed]',
    secondary: 'bg-[#db2777]',
    panel: 'bg-white',
  },
  {
    shell: 'bg-[#eef5ff]',
    accent: 'bg-[#0284c7]',
    secondary: 'bg-[#ea580c]',
    panel: 'bg-white',
  },
];

function getPreviewStyle(miniAppId: string) {
  const index = Math.abs(miniAppId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0));
  return PREVIEW_STYLES[index % PREVIEW_STYLES.length] ?? PREVIEW_STYLES[0];
}

function MiniAppPreview({ miniApp }: { miniApp: TMiniAppSummary }) {
  const style = getPreviewStyle(miniApp._id);

  return (
    <div className={cn('aspect-[16/10] overflow-hidden rounded-t-md p-3', style.shell)}>
      <div className="flex h-full flex-col rounded-md border border-black/10 bg-white/80 shadow-sm">
        <div className="flex h-6 shrink-0 items-center gap-1 border-b border-black/10 px-2">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
          <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
          <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[0.85fr_1.15fr] gap-2 p-2">
          <div className={cn('rounded-sm', style.accent)} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className={cn('h-3 rounded-sm', style.secondary)} />
            <div className="h-2 rounded-sm bg-black/10" />
            <div className="h-2 w-4/5 rounded-sm bg-black/10" />
            <div className="mt-auto grid grid-cols-2 gap-1">
              <div className={cn('h-8 rounded-sm', style.panel)} />
              <div className={cn('h-8 rounded-sm', style.panel)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniAppsLibrary() {
  const localize = useLocalize();
  const { data, isLoading } = useMiniAppsInfiniteQuery({ limit: 50 });
  const miniApps = useMemo(() => data?.pages.flatMap((page) => page.miniApps) ?? [], [data]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size={24} />
      </div>
    );
  }

  if (miniApps.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <AppWindow className="h-10 w-10 text-text-secondary" aria-hidden="true" />
        <div className="text-lg font-semibold">{localize('com_ui_mini_apps_select')}</div>
        <div className="max-w-md text-sm text-text-secondary">
          {localize('com_ui_mini_apps_select_hint')}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-5 w-5 text-text-secondary" aria-hidden="true" />
          <h2 className="text-xl font-semibold">{localize('com_ui_mini_apps_library')}</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {miniApps.map((miniApp) => {
            const fileCountKey =
              miniApp.fileCount === 1
                ? 'com_ui_mini_apps_file_count'
                : 'com_ui_mini_apps_files_count';

            return (
              <Link
                key={miniApp._id}
                to={`/mini-apps/${miniApp._id}`}
                className="group overflow-hidden rounded-md border border-border-light bg-surface-primary-alt transition-colors hover:border-border-medium hover:bg-surface-hover"
              >
                <MiniAppPreview miniApp={miniApp} />
                <div className="flex min-h-28 flex-col gap-2 p-3">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <h3 className="line-clamp-2 text-sm font-semibold text-text-primary">
                      {miniApp.title}
                    </h3>
                    <Code2
                      className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary"
                      aria-hidden="true"
                    />
                  </div>
                  {miniApp.description ? (
                    <p className="line-clamp-2 text-xs text-text-secondary">
                      {miniApp.description}
                    </p>
                  ) : null}
                  <div className="mt-auto text-xs text-text-secondary">
                    {localize(fileCountKey, { count: miniApp.fileCount })}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function MiniAppsView() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const params = useParams();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const selectedId = params.miniAppId;
  const { data: miniApp, isLoading } = useMiniAppQuery(selectedId);
  const deleteMutation = useDeleteMiniAppMutation();

  const deleteSelected = async () => {
    if (!selectedId) {
      return;
    }
    await deleteMutation.mutateAsync(selectedId);
    navigate('/mini-apps');
  };

  let content = (
    <div className="min-h-0 flex-1">{miniApp ? <MiniAppRunner miniApp={miniApp} /> : null}</div>
  );

  if (!selectedId) {
    content = <MiniAppsLibrary />;
  } else if (isLoading) {
    content = (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size={24} />
      </div>
    );
  } else if (!miniApp) {
    content = (
      <div className="flex flex-1 items-center justify-center text-sm text-text-secondary">
        {localize('com_ui_mini_apps_not_found')}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 bg-surface-primary text-text-primary">
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border-light px-4">
          <div className="flex min-w-0 items-center gap-2">
            {isSmallScreen ? <OpenSidebar /> : null}
            <h1 className="truncate text-base font-semibold">
              {miniApp?.title ?? localize('com_ui_mini_apps')}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {miniApp ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={deleteSelected}
                aria-label={localize('com_ui_delete')}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </header>

        {content}
      </main>
    </div>
  );
}
