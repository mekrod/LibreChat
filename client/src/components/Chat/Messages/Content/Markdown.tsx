import React, { memo, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { getRemarkPlugins, getRehypePlugins, getMarkdownComponents } from './markdownConfig';
import MarkdownErrorBoundary from './MarkdownErrorBoundary';
import MarkdownBlocks from './MarkdownBlocks';
import MiniAppOpenAction from '~/components/MiniApps/MiniAppOpenAction';
import { parseAnyMiniAppBundle } from '~/components/MiniApps/runtime';
import { preprocessLaTeX } from '~/utils';
import store from '~/store';

type TContentProps = {
  content: string;
  isLatestMessage: boolean;
  isSubmitting?: boolean;
};

const Markdown = memo(function Markdown({
  content = '',
  isLatestMessage,
  isSubmitting = false,
}: TContentProps) {
  const LaTeXParsing = useRecoilValue<boolean>(store.LaTeXParsing);
  const isInitializing = content === '';
  const isStreamingLatestMessage = isLatestMessage && isSubmitting;

  const currentContent = useMemo(() => {
    if (isInitializing) {
      return '';
    }
    return LaTeXParsing ? preprocessLaTeX(content) : content;
  }, [content, LaTeXParsing, isInitializing]);
  const miniAppBundle = useMemo(() => {
    if (isStreamingLatestMessage) {
      return null;
    }
    try {
      return parseAnyMiniAppBundle(content);
    } catch {
      return null;
    }
  }, [content, isStreamingLatestMessage]);

  if (isInitializing) {
    return (
      <div className="absolute">
        <p className="relative">
          <span className={isLatestMessage ? 'result-thinking' : ''} />
        </p>
      </div>
    );
  }

  return (
    <MarkdownErrorBoundary content={content} codeExecution={true}>
      {miniAppBundle ? (
        <MiniAppOpenAction text={content} />
      ) : (
        <MarkdownBlocks
          content={currentContent}
          remarkPlugins={getRemarkPlugins()}
          rehypePlugins={getRehypePlugins()}
          components={getMarkdownComponents()}
        />
      )}
    </MarkdownErrorBoundary>
  );
});
Markdown.displayName = 'Markdown';

export default Markdown;
