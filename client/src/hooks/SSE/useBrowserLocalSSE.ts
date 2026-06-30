import { useEffect, useRef } from 'react';
import { v4 } from 'uuid';
import { useSetRecoilState } from 'recoil';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Constants, ContentTypes, QueryKeys } from 'librechat-data-provider';
import type { TMessage, TSubmission, TConversation } from 'librechat-data-provider';
import type { EventHandlerParams } from './useEventHandlers';
import type { BrowserLocalChatMessage } from '~/utils/browserLocalGemma';
import { getBrowserLocalProgressText, loadBrowserLocalGemma } from '~/utils/browserLocalGemma';
import { saveBrowserLocalConversation } from '~/utils/browserLocalStore';
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

function updateResponseMessage(
  messages: TMessage[],
  responseId: string,
  update: Partial<TMessage>,
): TMessage[] {
  return messages.map((message) =>
    message.messageId === responseId ? { ...message, ...update } : message,
  );
}

function buildTextContent(text: string): TMessage['content'] {
  return [
    {
      type: ContentTypes.TEXT,
      [ContentTypes.TEXT]: text,
    },
  ] as TMessage['content'];
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

        const setResponseText = (text: string, unfinished = true) => {
          const messages = getMessages() ?? hydratedMessages;
          const timestamp = new Date().toISOString();
          const nextMessages = updateResponseMessage(messages, responseId, {
            text,
            unfinished,
            content: buildTextContent(text),
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
        const promptMessages = toBrowserMessages([
          ...currentSubmission.messages,
          currentSubmission.userMessage,
        ]);
        for await (const chunk of model.generate(promptMessages, {
          maxNewTokens: 4096,
          signal: controller.signal,
        })) {
          if (controller.signal.aborted) {
            break;
          }
          reply = chunk.text;
          setResponseText(reply);
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
