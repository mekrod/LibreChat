import { useEffect, useRef } from 'react';
import { v4 } from 'uuid';
import { useSetRecoilState } from 'recoil';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Constants, ContentTypes, QueryKeys, ToolCallTypes } from 'librechat-data-provider';
import type {
  TMessage,
  TSubmission,
  TAttachment,
  TConversation,
  TMessageContentParts,
} from 'librechat-data-provider';
import type { EventHandlerParams } from './useEventHandlers';
import type { BrowserLocalChatMessage } from '~/utils/browserLocalGemma';
import { getBrowserLocalProgressText, loadBrowserLocalGemma } from '~/utils/browserLocalGemma';
import { saveBrowserLocalConversation } from '~/utils/browserLocalStore';
import { buildBrowserLocalSystemMessage } from '~/utils/browserLocalPrompts';
import {
  hasBrowserLocalMiniAppBundle,
  isBrowserLocalMiniAppRequest,
  normalizeBrowserLocalMiniAppResponse,
} from '~/utils/browserLocalMiniApps';
import { formatBrowserLocalToolResults, runBrowserLocalTools } from '~/utils/browserLocalTools';
import { clearAllDrafts, upsertConvoInAllQueries } from '~/utils';
import store from '~/store';

type ChatHelpers = Pick<
  EventHandlerParams,
  'setMessages' | 'getMessages' | 'setConversation' | 'setIsSubmitting' | 'newConversation'
>;

const hasConcreteConversationId = (conversationId?: string | null) =>
  !!conversationId &&
  conversationId !== Constants.NEW_CONVO &&
  conversationId !== Constants.PENDING_CONVO;

function toBrowserMessages(messages: TMessage[]): BrowserLocalChatMessage[] {
  return messages.reduce<BrowserLocalChatMessage[]>((acc, message) => {
    if (!message.text || message.error) {
      return acc;
    }

    acc.push({
      role: message.isCreatedByUser ? 'user' : 'assistant',
      content: message.text,
    });
    return acc;
  }, []);
}

function addContextToLastUserMessage(
  messages: BrowserLocalChatMessage[],
  context: string,
  placement: 'before' | 'after',
): BrowserLocalChatMessage[] {
  const content = context.trim();
  if (!content) {
    return messages;
  }

  const nextMessages = [...messages];
  for (let i = nextMessages.length - 1; i >= 0; i--) {
    if (nextMessages[i].role !== 'user') {
      continue;
    }
    nextMessages[i] = {
      ...nextMessages[i],
      content:
        placement === 'before'
          ? `${content}\n\nUser request:\n${nextMessages[i].content}`
          : `${nextMessages[i].content}\n\n${content}`,
    };
    return nextMessages;
  }

  return [{ role: 'user', content }, ...nextMessages];
}

function addAppRepairInstruction(messages: BrowserLocalChatMessage[]): BrowserLocalChatMessage[] {
  return addContextToLastUserMessage(
    messages,
    `Your previous answer did not create the requested app in LibreChat's renderable format.
You must now output a complete LibreChat mini app bundle:
1. Start with a \`\`\`miniapp JSON manifest whose entryFile is "src/index.jsx".
2. Then output separate fenced file blocks with file="src/index.jsx", file="src/App.jsx", and any needed CSS/data files.
3. Do not provide only an explanation, apology, raw HTML, shell commands, or placeholders.`,
    'after',
  );
}

function updateResponseMessage(
  messages: TMessage[],
  responseId: string,
  update: Partial<TMessage>,
): TMessage[] {
  return messages.map((message) =>
    message.messageId === responseId ? { ...message, ...update } : message,
  );
}

function buildTextContent(text: string): TMessageContentParts[] {
  return [
    {
      type: ContentTypes.TEXT,
      [ContentTypes.TEXT]: text,
    },
  ] as TMessageContentParts[];
}

function buildToolCallContent({
  id,
  name,
  args,
  output,
  progress,
}: {
  id: string;
  name: string;
  args: Record<string, unknown>;
  output?: string;
  progress: number;
}): TMessageContentParts {
  return {
    type: ContentTypes.TOOL_CALL,
    [ContentTypes.TOOL_CALL]: {
      id,
      name,
      args,
      output,
      progress,
      type: ToolCallTypes.TOOL_CALL,
    },
  } as TMessageContentParts;
}

function buildResponseContent(
  text: string,
  toolParts: TMessageContentParts[],
): TMessageContentParts[] {
  const trimmedText = text.length > 0 ? buildTextContent(text) : [];
  return [...toolParts, ...trimmedText];
}

function stringifyToolOutput(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeToolAttachments(
  attachments: unknown[] | undefined,
  toolCallId: string,
): TAttachment[] {
  return (attachments ?? [])
    .filter((attachment): attachment is TAttachment => {
      return attachment !== null && typeof attachment === 'object' && !Array.isArray(attachment);
    })
    .map((attachment) => ({
      ...attachment,
      toolCallId,
    }));
}

function buildLocalConversation(submission: TSubmission, conversationId: string): TConversation {
  const now = new Date().toISOString();
  return {
    ...submission.conversation,
    conversationId,
    endpoint: submission.conversation.endpoint ?? null,
    title: submission.conversation.title || submission.userMessage.text.slice(0, 60) || 'New Chat',
    messages: [submission.userMessage.messageId, submission.initialResponse?.messageId].filter(
      (messageId): messageId is string => typeof messageId === 'string' && messageId.length > 0,
    ),
    createdAt: submission.conversation.createdAt || now,
    updatedAt: now,
  } as TConversation;
}

export default function useBrowserLocalSSE(
  submission: TSubmission | null,
  chatHelpers: ChatHelpers,
  runIndex = 0,
) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);
  const setShowStopButton = useSetRecoilState(store.showStopButtonByIndex(runIndex));
  const latestRef = useRef({ chatHelpers, navigate, queryClient, setShowStopButton });
  latestRef.current = { chatHelpers, navigate, queryClient, setShowStopButton };
  const submissionRef = useRef(submission);
  submissionRef.current = submission;
  const submissionKey =
    submission?.initialResponse?.messageId ?? submission?.userMessage?.messageId ?? '';

  useEffect(() => {
    const currentSubmission = submissionRef.current;
    if (!currentSubmission || Object.keys(currentSubmission).length === 0) {
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }
    const {
      chatHelpers: { setMessages, getMessages, setConversation, setIsSubmitting },
      navigate: latestNavigate,
      queryClient: latestQueryClient,
      setShowStopButton: latestSetShowStopButton,
    } = latestRef.current;

    const controller = new AbortController();
    abortRef.current = controller;

    const responseId = currentSubmission.initialResponse?.messageId;
    if (!responseId) {
      return;
    }

    const conversationId = hasConcreteConversationId(currentSubmission.conversation?.conversationId)
      ? (currentSubmission.conversation.conversationId as string)
      : v4();

    const run = async () => {
      try {
        setIsSubmitting(true);

        const currentMessages =
          getMessages() ??
          [
            ...currentSubmission.messages,
            currentSubmission.userMessage,
            currentSubmission.initialResponse,
          ].filter((message): message is TMessage => message != null);

        const hydratedMessages = currentMessages.map((message) =>
          hasConcreteConversationId(message.conversationId)
            ? message
            : { ...message, conversationId },
        );
        let localConversation = buildLocalConversation(currentSubmission, conversationId);
        setConversation?.(localConversation);
        setMessages(hydratedMessages);
        saveBrowserLocalConversation(localConversation, hydratedMessages);
        latestQueryClient.setQueryData<TConversation>(
          [QueryKeys.conversation, conversationId],
          localConversation,
        );
        latestQueryClient.setQueryData<TMessage[]>(
          [QueryKeys.messages, conversationId],
          hydratedMessages,
        );
        latestQueryClient.setQueryData<TMessage[]>(
          [QueryKeys.messages, Constants.NEW_CONVO],
          hydratedMessages,
        );
        upsertConvoInAllQueries(latestQueryClient, localConversation);

        if (window.location.pathname === `/c/${Constants.NEW_CONVO}`) {
          latestNavigate(`/c/${conversationId}`, { replace: true, state: { focusChat: true } });
        }

        let responseText = '';
        let toolParts: TMessageContentParts[] = [];
        let toolAttachments: TAttachment[] = [];

        const setResponseText = (text: string, unfinished = true) => {
          responseText = text;
          const messages = getMessages() ?? hydratedMessages;
          const timestamp = new Date().toISOString();
          const content = buildResponseContent(text, toolParts);
          const nextMessages = updateResponseMessage(messages, responseId, {
            text,
            unfinished,
            content,
            attachments: toolAttachments,
            ...(!unfinished ? { createdAt: timestamp, updatedAt: timestamp } : {}),
          });
          localConversation = {
            ...localConversation,
            updatedAt: timestamp,
            messages: nextMessages
              .map((message) => message.messageId)
              .filter((messageId): messageId is string => typeof messageId === 'string'),
          };
          setMessages(nextMessages);
          latestQueryClient.setQueryData<TConversation>(
            [QueryKeys.conversation, conversationId],
            localConversation,
          );
          latestQueryClient.setQueryData<TMessage[]>(
            [QueryKeys.messages, conversationId],
            nextMessages,
          );
          saveBrowserLocalConversation(localConversation, nextMessages);
          upsertConvoInAllQueries(latestQueryClient, localConversation);
        };

        const updateToolCall = ({
          toolCallId,
          tool,
          args,
          output,
          progress,
          attachments,
        }: {
          toolCallId: string;
          tool: string;
          args: Record<string, unknown>;
          output?: string;
          progress: number;
          attachments?: TAttachment[];
        }) => {
          const nextPart = buildToolCallContent({
            id: toolCallId,
            name: tool,
            args,
            output,
            progress,
          });
          const existingIndex = toolParts.findIndex((part) => {
            const toolCall = part[ContentTypes.TOOL_CALL];
            return toolCall?.id === toolCallId;
          });
          toolParts =
            existingIndex >= 0
              ? toolParts.map((part, index) => (index === existingIndex ? nextPart : part))
              : [...toolParts, nextPart];
          if (attachments && attachments.length > 0) {
            const attachmentIds = new Set(attachments.map((attachment) => attachment.toolCallId));
            toolAttachments = [
              ...toolAttachments.filter((attachment) => !attachmentIds.has(attachment.toolCallId)),
              ...attachments,
            ];
          }
          setResponseText(responseText);
        };

        setResponseText('Loading browser local model...');
        const model = await loadBrowserLocalGemma({
          signal: controller.signal,
          onProgress: (progress) => {
            if (!controller.signal.aborted) {
              setResponseText(getBrowserLocalProgressText(progress));
            }
          },
        });

        if (controller.signal.aborted) {
          return;
        }

        let reply = '';
        const systemMessage = buildBrowserLocalSystemMessage(currentSubmission);
        let promptMessages = toBrowserMessages([
          ...currentSubmission.messages,
          currentSubmission.userMessage,
        ]);
        if (systemMessage != null) {
          promptMessages = addContextToLastUserMessage(
            promptMessages,
            `LibreChat instructions for this browser-local response:\n${systemMessage.content}`,
            'before',
          );
        }
        const toolResults = await runBrowserLocalTools({
          model,
          responseId,
          conversationId,
          submission: currentSubmission,
          signal: controller.signal,
          messages: promptMessages,
          onStatus: setResponseText,
          onToolStart: ({ tool, args }) => {
            const toolCallId = `browserlocal_${tool}_${v4()}`;
            updateToolCall({
              tool,
              args,
              toolCallId,
              progress: 0.1,
            });
            return toolCallId;
          },
          onToolEnd: ({ tool, args, result, toolCallId }) => {
            if (!toolCallId) {
              return;
            }
            updateToolCall({
              tool,
              args,
              toolCallId,
              progress: result.error ? 0.1 : 1,
              output: result.error ?? stringifyToolOutput(result.result),
              attachments: normalizeToolAttachments(result.attachments, toolCallId),
            });
          },
        });
        const toolContext = formatBrowserLocalToolResults(toolResults);
        if (toolContext) {
          promptMessages = addContextToLastUserMessage(
            promptMessages,
            `Use these tool results when answering. Do not claim a tool failed if it returned useful output.\n\n${toolContext}`,
            'after',
          );
        }
        const generateReply = async (messages: BrowserLocalChatMessage[]) => {
          let text = '';
          for await (const chunk of model.generate(messages, {
            maxNewTokens: 4096,
            signal: controller.signal,
          })) {
            if (controller.signal.aborted) {
              break;
            }
            text = chunk.text;
            setResponseText(text);
          }
          return text;
        };

        const shouldCreateMiniApp = isBrowserLocalMiniAppRequest(
          currentSubmission.userMessage.text,
        );

        reply = await generateReply(promptMessages);
        if (!controller.signal.aborted && shouldCreateMiniApp) {
          reply =
            normalizeBrowserLocalMiniAppResponse(reply, currentSubmission.userMessage.text) ??
            reply;

          if (!hasBrowserLocalMiniAppBundle(reply)) {
            setResponseText('Creating browser local app...');
            model.reset();
            const repairedReply = await generateReply(addAppRepairInstruction(promptMessages));
            reply =
              normalizeBrowserLocalMiniAppResponse(
                repairedReply,
                currentSubmission.userMessage.text,
              ) ?? repairedReply;
          }
        }

        setResponseText(reply, false);
        clearAllDrafts(currentSubmission.conversation?.conversationId);
        clearAllDrafts(Constants.NEW_CONVO);
      } catch (error) {
        if (!controller.signal.aborted) {
          const text = error instanceof Error ? error.message : String(error);
          const messages =
            getMessages() ??
            [
              ...currentSubmission.messages,
              currentSubmission.userMessage,
              currentSubmission.initialResponse,
            ].filter((message): message is TMessage => message != null);
          const timestamp = new Date().toISOString();
          const nextMessages = updateResponseMessage(messages, responseId, {
            text: `Browser local model failed: ${text}`,
            unfinished: false,
            error: true,
            createdAt: timestamp,
            updatedAt: timestamp,
            content: buildTextContent(`Browser local model failed: ${text}`),
          });
          setMessages(nextMessages);
          saveBrowserLocalConversation(
            buildLocalConversation(currentSubmission, conversationId),
            nextMessages,
          );
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        setIsSubmitting(false);
        latestSetShowStopButton(false);
      }
    };

    run();

    return () => {
      controller.abort();
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      if (runIndex >= 0) {
        setIsSubmitting(false);
        latestSetShowStopButton(false);
      }
    };
  }, [runIndex, submissionKey]);
}
