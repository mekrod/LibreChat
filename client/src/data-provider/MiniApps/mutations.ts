import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataService, QueryKeys } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type {
  TMiniApp,
  TCreateMiniAppRequest,
  TUpdateMiniAppRequest,
  TDeleteMiniAppResponse,
} from 'librechat-data-provider';

export const useCreateMiniAppMutation = (): UseMutationResult<
  TMiniApp,
  unknown,
  TCreateMiniAppRequest,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((payload: TCreateMiniAppRequest) => dataService.createMiniApp(payload), {
    onSuccess: (miniApp) => {
      queryClient.setQueryData([QueryKeys.miniApp, miniApp._id], miniApp);
      queryClient.invalidateQueries([QueryKeys.miniApps]);
    },
  });
};

export const useUpdateMiniAppMutation = (): UseMutationResult<
  TMiniApp,
  unknown,
  { id: string; payload: TUpdateMiniAppRequest },
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(({ id, payload }) => dataService.updateMiniApp(id, payload), {
    onSuccess: (miniApp) => {
      queryClient.setQueryData([QueryKeys.miniApp, miniApp._id], miniApp);
      queryClient.invalidateQueries([QueryKeys.miniApps]);
    },
  });
};

export const useDeleteMiniAppMutation = (): UseMutationResult<
  TDeleteMiniAppResponse,
  unknown,
  string,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((id: string) => dataService.deleteMiniApp(id), {
    onSuccess: (_result, id) => {
      queryClient.removeQueries([QueryKeys.miniApp, id]);
      queryClient.invalidateQueries([QueryKeys.miniApps]);
    },
  });
};
