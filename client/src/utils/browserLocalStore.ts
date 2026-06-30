import type { TConversation, TMessage } from 'librechat-data-provider';
import { isBrowserLocalEndpoint } from './browserLocal';

type BrowserLocalRecord = {
  conversation: TConversation;
  messages: TMessage[];
};

const storageKey = 'librechat.browserLocal.conversations.v1';

function readRecords(): Record<string, BrowserLocalRecord> {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, BrowserLocalRecord>)
      : {};
  } catch {
    return {};
  }
}

function writeRecords(records: Record<string, BrowserLocalRecord>) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(records));
}

export function getBrowserLocalConversation(conversationId?: string | null) {
  if (!conversationId) {
    return null;
  }

  return readRecords()[conversationId]?.conversation ?? null;
}

export function getBrowserLocalMessages(conversationId?: string | null) {
  if (!conversationId) {
    return null;
  }

  return readRecords()[conversationId]?.messages ?? null;
}

export function saveBrowserLocalConversation(conversation: TConversation, messages: TMessage[]) {
  const conversationId = conversation.conversationId;
  if (!conversationId || !isBrowserLocalEndpoint(conversation.endpoint)) {
    return;
  }

  const records = readRecords();
  records[conversationId] = {
    conversation: {
      ...conversation,
      messages: messages
        .map((message) => message.messageId)
        .filter((messageId): messageId is string => typeof messageId === 'string'),
      updatedAt: conversation.updatedAt || new Date().toISOString(),
    },
    messages,
  };
  writeRecords(records);
}

export function isBrowserLocalConversationId(conversationId?: string | null) {
  return getBrowserLocalConversation(conversationId) != null;
}

export function listBrowserLocalConversations() {
  return Object.values(readRecords())
    .map((record) => record.conversation)
    .sort((a, b) => {
      const aTime = Date.parse(a.updatedAt || a.createdAt || '');
      const bTime = Date.parse(b.updatedAt || b.createdAt || '');
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    });
}
