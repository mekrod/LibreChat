import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSetRecoilState } from 'recoil';
import { AppWindow, Home } from 'lucide-react';
import { Spinner, useMediaQuery } from '@librechat/client';
import { useMiniAppsInfiniteQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import store from '~/store';
import { cn } from '~/utils';

export default function MiniAppsPanel() {
  const localize = useLocalize();
  const params = useParams();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const setSidebarExpanded = useSetRecoilState(store.sidebarExpanded);
  const { data, isLoading } = useMiniAppsInfiniteQuery({ limit: 50 });
  const miniApps = useMemo(() => data?.pages.flatMap((page) => page.miniApps) ?? [], [data]);

  const handleSelect = () => {
    if (isSmallScreen) {
      setSidebarExpanded(false);
    }
  };

  let content = (
    <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-3">
      {miniApps.map((miniApp) => (
        <Link
          key={miniApp._id}
          to={`/mini-apps/${miniApp._id}`}
          onClick={handleSelect}
          className={cn(
            'rounded-md px-3 py-2 text-sm transition-colors hover:bg-surface-hover',
            params.miniAppId === miniApp._id
              ? 'bg-surface-active-alt text-text-primary'
              : 'text-text-secondary',
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <AppWindow className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate font-medium">{miniApp.title}</span>
          </div>
          {miniApp.description ? (
            <div className="mt-1 line-clamp-2 text-xs text-text-secondary">
              {miniApp.description}
            </div>
          ) : null}
        </Link>
      ))}
    </div>
  );

  if (isLoading) {
    content = (
      <div className="flex h-32 items-center justify-center">
        <Spinner size={20} />
      </div>
    );
  } else if (miniApps.length === 0) {
    content = (
      <div className="px-4 py-3 text-sm text-text-secondary">
        {localize('com_ui_mini_apps_empty')}
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col overflow-hidden"
      role="region"
      aria-label={localize('com_ui_mini_apps')}
    >
      <div className="flex items-center justify-between px-4 py-2">
        <h2 className="truncate text-lg font-bold text-text-primary">
          {localize('com_ui_mini_apps')}
        </h2>
        <Link
          to="/mini-apps"
          onClick={handleSelect}
          className={cn(
            'inline-flex size-8 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary',
            !params.miniAppId ? 'bg-surface-active-alt text-text-primary' : '',
          )}
          aria-label={localize('com_ui_home')}
        >
          <Home className="size-4" aria-hidden="true" />
        </Link>
      </div>

      {content}
    </div>
  );
}
