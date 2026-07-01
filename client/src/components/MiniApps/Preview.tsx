import { cn } from '~/utils';

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

export function getMiniAppPreviewStyle(miniAppId: string) {
  const index = Math.abs(miniAppId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0));
  return PREVIEW_STYLES[index % PREVIEW_STYLES.length] ?? PREVIEW_STYLES[0];
}

export default function MiniAppPreview({
  miniAppId,
  className,
}: {
  miniAppId: string;
  className?: string;
}) {
  const style = getMiniAppPreviewStyle(miniAppId);

  return (
    <div className={cn('aspect-[16/10] overflow-hidden rounded-t-md p-3', style.shell, className)}>
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
