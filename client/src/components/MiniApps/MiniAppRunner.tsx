import { memo, useMemo } from 'react';
import { SandpackPreview, SandpackProvider } from '@codesandbox/sandpack-react/unstyled';
import type { TMiniApp } from 'librechat-data-provider';
import { getDependencies, sharedFiles } from '~/utils/artifacts';
import { getSandpackActiveFile, getSandpackRuntimeEntry, toSandpackFiles } from './runtime';

function getTemplate(files: Record<string, string>) {
  const paths = Object.keys(files);
  const usesTypeScript = paths.some((path) => /\.(ts|tsx)$/.test(path));
  const usesVite =
    files['/index.html'] != null ||
    files['/package.json']?.includes('vite') === true ||
    paths.some((path) => /^\/src\/main\.(jsx?|tsx?)$/.test(path));

  if (usesVite) {
    return usesTypeScript ? 'vite-react-ts' : 'vite-react';
  }

  return usesTypeScript ? 'react-ts' : 'react';
}

function MiniAppRunner({ miniApp }: { miniApp: TMiniApp }) {
  const files = useMemo(
    () => toSandpackFiles(miniApp.files, miniApp.entryFile),
    [miniApp.entryFile, miniApp.files],
  );
  const runtimeEntry = useMemo(
    () => getSandpackRuntimeEntry(files, miniApp.entryFile),
    [files, miniApp.entryFile],
  );
  const customSetup = useMemo(
    () => ({
      dependencies: getDependencies('application/vnd.react'),
      ...(runtimeEntry ? { entry: runtimeEntry } : {}),
    }),
    [runtimeEntry],
  );
  const template = useMemo(() => getTemplate(files), [files]);
  const activeFile = useMemo(() => getSandpackActiveFile(miniApp.entryFile), [miniApp.entryFile]);

  return (
    <SandpackProvider
      template={template}
      files={{ ...files, ...sharedFiles }}
      customSetup={customSetup}
      options={{
        activeFile,
        visibleFiles: Object.keys(files),
        recompileMode: 'delayed',
        recompileDelay: 500,
      }}
    >
      <SandpackPreview
        showOpenInCodeSandbox={false}
        showRefreshButton={true}
        className="h-full w-full"
      />
    </SandpackProvider>
  );
}

export default memo(MiniAppRunner);
