import { ChevronLeft } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useToastContext } from '@librechat/client';
import { useGetAgentByIdQuery, useRevertAgentVersionMutation } from '~/data-provider';
import type { AgentWithVersions, VersionContext } from './types';
import { isActiveVersion } from './isActiveVersion';
import { useAgentPanelContext } from '~/Providers';
import VersionContent from './VersionContent';
import { useLocalize } from '~/hooks';
import { Panel } from '~/common';

export default function VersionPanel() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { agent_id, setActivePanel } = useAgentPanelContext();

  const selectedAgentId = agent_id ?? '';

  const { data: agent, isLoading, error, refetch } = useGetAgentByIdQuery(selectedAgentId);

  const revertAgentVersion = useRevertAgentVersionMutation({
    onSuccess: () => {
      showToast({
        message: localize('com_ui_agent_version_restore_success'),
        status: 'success',
      });
      refetch();
    },
    onError: () => {
      showToast({
        message: localize('com_ui_agent_version_restore_error'),
        status: 'error',
      });
    },
  });

  const agentWithVersions = agent as AgentWithVersions;

  const currentAgent = useMemo(() => {
    if (!agentWithVersions) return null;
    return {
      name: agentWithVersions.name,
      description: agentWithVersions.description,
      instructions: agentWithVersions.instructions,
      artifacts: agentWithVersions.artifacts,
      capabilities: agentWithVersions.capabilities,
      tools: agentWithVersions.tools,
    };
  }, [agentWithVersions]);

  const versions = useMemo(() => {
    const versionsCopy = [...(agentWithVersions?.versions || [])];
    return versionsCopy.sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [agentWithVersions?.versions]);

  const activeVersion = useMemo(() => {
    return versions.length > 0
      ? versions.find((v) => isActiveVersion(v, currentAgent, versions)) || null
      : null;
  }, [versions, currentAgent]);

  const versionIds = useMemo(() => {
    if (versions.length === 0) return [];

    const matchingVersions = versions.filter((v) => isActiveVersion(v, currentAgent, versions));

    const activeVersionId =
      matchingVersions.length > 0 ? versions.findIndex((v) => v === matchingVersions[0]) : -1;

    return versions.map((version, displayIndex) => {
      const originalIndex =
        agentWithVersions?.versions?.findIndex(
          (v) =>
            v.updatedAt === version.updatedAt &&
            v.createdAt === version.createdAt &&
            v.name === version.name,
        ) ?? displayIndex;

      return {
        id: displayIndex,
        originalIndex,
        version,
        isActive: displayIndex === activeVersionId,
      };
    });
  }, [versions, currentAgent, agentWithVersions?.versions]);

  const versionContext: VersionContext = useMemo(
    () => ({
      versions,
      versionIds,
      currentAgent,
      selectedAgentId,
      activeVersion,
    }),
    [versions, versionIds, currentAgent, selectedAgentId, activeVersion],
  );

  const handleRestore = useCallback(
    (displayIndex: number) => {
      const versionWithId = versionIds.find((v) => v.id === displayIndex);

      if (versionWithId) {
        const originalIndex = versionWithId.originalIndex;

        revertAgentVersion.mutate({
          agent_id: selectedAgentId,
          version_index: originalIndex,
        });
      }
    },
    [revertAgentVersion, selectedAgentId, versionIds],
  );

  const versionCount = versionIds.length;
  const countLabel =
    versionCount > 0
      ? localize(
          versionCount === 1 ? 'com_ui_agent_version_count_one' : 'com_ui_agent_version_count',
          { count: versionCount },
        )
      : null;

  return (
    <div className="scrollbar-gutter-stable h-full min-h-[40vh] overflow-auto pb-12 text-sm">
      <header className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-2 pb-2 pt-1">
        <button
          type="button"
          onClick={() => setActivePanel(Panel.builder)}
          aria-label={localize('com_ui_back_to_builder')}
          className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-border-light text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <div className="flex flex-col items-center">
          <h2 className="text-base font-semibold text-text-primary">
            {localize('com_ui_agent_version_history')}
          </h2>
          {countLabel && (
            <p className="text-xs text-text-secondary" aria-live="polite">
              {countLabel}
            </p>
          )}
        </div>
        <span aria-hidden="true" className="h-10 w-10" />
      </header>
      <div className="flex flex-col px-2 pt-2">
        <VersionContent
          selectedAgentId={selectedAgentId}
          isLoading={isLoading}
          error={error}
          versionContext={versionContext}
          onRestore={handleRestore}
        />
      </div>
    </div>
  );
}
