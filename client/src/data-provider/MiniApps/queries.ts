import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { dataService, QueryKeys } from 'librechat-data-provider';
import type { UseInfiniteQueryOptions, UseQueryOptions } from '@tanstack/react-query';
import type { TMiniApp, TMiniAppListRequest, TMiniAppListResponse } from 'librechat-data-provider';

export const useMiniAppsInfiniteQuery = (
  params: TMiniAppListRequest = {},
  config?: UseInfiniteQueryOptions<TMiniAppListResponse, unknown>,
) => {
  const { search, limit } = params;
  return useInfiniteQuery<TMiniAppListResponse>({
    queryKey: [QueryKeys.miniApps, { search, limit }],
    queryFn: ({ pageParam }) =>
      dataService.listMiniApps({
        search,
        limit,
        cursor: pageParam?.toString(),
      }),
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    keepPreviousData: true,
    staleTime: 5 * 60 * 1000,
    cacheTime: 30 * 60 * 1000,
    ...config,
  });
};

export const useMiniAppQuery = (id?: string | null, config?: UseQueryOptions<TMiniApp>) =>
  useQuery<TMiniApp>([QueryKeys.miniApp, id], () => dataService.getMiniAppById(id ?? ''), {
    enabled: Boolean(id),
    refetchOnWindowFocus: false,
    ...config,
  });
