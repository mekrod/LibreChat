import { useCallback } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { replaceSpecialVars } from 'librechat-data-provider';
import type { MiniAppCustomization } from '~/store/families';
import { useChatContext, useChatFormContext, useAddedChatContext } from '~/Providers';
import { useLatestMessage } from '~/hooks/Messages/useLatestMessage';
import { useAuthContext } from '~/hooks/AuthContext';
import { mainTextareaId } from '~/common';
import store from '~/store';

function buildMiniAppCustomizationPrompt(customization: MiniAppCustomization) {
  if (!customization.enabled || !customization.miniAppId) {
    return '';
  }

  const action =
    customization.action === 'erase_feature'
      ? 'Erase or remove the requested feature from this mini app.'
      : 'Add the requested feature to this mini app.';
  const title = customization.miniAppTitle || 'Selected mini app';
  const description = customization.miniAppDescription
    ? `\nApp description: ${customization.miniAppDescription}`
    : '';

  return [
    '<mini_app_customization>',
    `App id: ${customization.miniAppId}`,
    `App title: ${title}${description}`,
    `Requested customization mode: ${action}`,
    '</mini_app_customization>',
  ].join('\n');
}

export default function useSubmitMessage() {
  const { user } = useAuthContext();
  const methods = useChatFormContext();
  const { conversation: addedConvo } = useAddedChatContext();
  const { ask, index, getMessages, setMessages } = useChatContext();
  const latestMessage = useLatestMessage(index);

  const autoSendPrompts = useRecoilValue(store.autoSendPrompts);
  const miniAppCustomization = useRecoilValue(store.miniAppCustomizationByIndex(index));
  const setActivePrompt = useSetRecoilState(store.activePromptByIndex(index));

  const submitMessage = useCallback(
    (data?: { text: string }) => {
      if (!data) {
        return console.warn('No data provided to submitMessage');
      }
      const rootMessages = getMessages();
      const isLatestInRootMessages = rootMessages?.some(
        (message) => message.messageId === latestMessage?.messageId,
      );
      if (!isLatestInRootMessages && latestMessage) {
        setMessages([...(rootMessages || []), latestMessage]);
      }

      const customizationPrompt = buildMiniAppCustomizationPrompt(miniAppCustomization);
      const submitted = ask(
        {
          text: customizationPrompt ? `${data.text}\n\n${customizationPrompt}` : data.text,
        },
        {
          addedConvo: addedConvo ?? undefined,
        },
      );
      if (submitted === false) {
        return false;
      }
      methods.reset();
    },
    [ask, methods, addedConvo, setMessages, getMessages, latestMessage, miniAppCustomization],
  );

  const submitPrompt = useCallback(
    (text: string) => {
      const parsedText = replaceSpecialVars({ text, user });
      if (autoSendPrompts) {
        submitMessage({ text: parsedText });
        return;
      }

      const textarea = document.getElementById(mainTextareaId) as HTMLTextAreaElement | null;
      const currentText = textarea?.value ?? methods.getValues('text');
      const newText = currentText.trim().length > 1 ? `\n${parsedText}` : parsedText;
      setActivePrompt(newText);
    },
    [autoSendPrompts, submitMessage, setActivePrompt, methods, user],
  );

  return { submitMessage, submitPrompt };
}
