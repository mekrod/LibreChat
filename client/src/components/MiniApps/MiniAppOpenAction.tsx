import React, { memo, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppWindow } from 'lucide-react';
import { Button, useToastContext } from '@librechat/client';
import { useCreateMiniAppMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { useMessageContext } from '~/Providers';
import { getMiniAppBundleStorageKey, parseAnyMiniAppBundle } from './runtime';

function tryParseMiniAppBundle(text: string) {
  try {
    const bundle = parseAnyMiniAppBundle(text);
    const hasFiles = Object.values(bundle.files).some((content) => content.trim().length > 0);
    return hasFiles ? bundle : null;
  } catch {
    return null;
  }
}

function getErrorMessage(error: unknown): string | null {
  if (error == null || typeof error !== 'object') {
    return null;
  }

  const maybeError = error as {
    message?: unknown;
    response?: { data?: { error?: unknown; message?: unknown } };
  };
  const responseMessage = maybeError.response?.data?.error ?? maybeError.response?.data?.message;
  if (typeof responseMessage === 'string' && responseMessage.trim()) {
    return responseMessage;
  }
  if (typeof maybeError.message === 'string' && maybeError.message.trim()) {
    return maybeError.message;
  }
  return null;
}

const MiniAppOpenAction = memo(function MiniAppOpenAction({ text }: { text: string }) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { isLatestMessage = false, isSubmitting = false } = useMessageContext();
  const { showToast } = useToastContext();
  const createMutation = useCreateMiniAppMutation();
  const [miniAppId, setMiniAppId] = React.useState<string | null>(null);
  const [createError, setCreateError] = React.useState(false);
  const isStreamingLatestMessage = isLatestMessage && isSubmitting;
  const bundle = useMemo(() => {
    if (isStreamingLatestMessage) {
      return null;
    }
    return tryParseMiniAppBundle(text);
  }, [isStreamingLatestMessage, text]);
  const storageKey = useMemo(() => getMiniAppBundleStorageKey(text), [text]);
  const startedKeyRef = useRef<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setCreateError(false);
  }, [storageKey]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isStreamingLatestMessage || !saveTimerRef.current) {
      return;
    }
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    startedKeyRef.current = null;
  }, [isStreamingLatestMessage]);

  useEffect(() => {
    if (!bundle || isStreamingLatestMessage || typeof window === 'undefined') {
      return;
    }

    const savedMiniAppId = window.localStorage.getItem(storageKey);
    if (savedMiniAppId) {
      setMiniAppId(savedMiniAppId);
    }
  }, [bundle, isStreamingLatestMessage, storageKey]);

  useEffect(() => {
    if (
      !bundle ||
      isStreamingLatestMessage ||
      miniAppId ||
      createError ||
      startedKeyRef.current === storageKey
    ) {
      return;
    }

    if (typeof window !== 'undefined') {
      const savedMiniAppId = window.localStorage.getItem(storageKey);
      if (savedMiniAppId) {
        setMiniAppId(savedMiniAppId);
        return;
      }
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      startedKeyRef.current = storageKey;
      setCreateError(false);
      createMutation
        .mutateAsync(bundle)
        .then((miniApp) => {
          setMiniAppId(miniApp._id);
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(storageKey, miniApp._id);
          }
        })
        .catch((error) => {
          startedKeyRef.current = null;
          setCreateError(true);
          const detail = getErrorMessage(error);
          showToast({
            status: 'error',
            message: detail
              ? `${localize('com_ui_mini_apps_save_failed')}: ${detail}`
              : localize('com_ui_mini_apps_save_failed'),
          });
        });
    }, 2500);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [
    bundle,
    createError,
    createMutation,
    isStreamingLatestMessage,
    localize,
    miniAppId,
    showToast,
    storageKey,
  ]);

  if (!bundle || isStreamingLatestMessage) {
    return null;
  }

  const openMiniApp = () => {
    if (miniAppId) {
      navigate(`/mini-apps/${miniAppId}`);
    } else if (createError) {
      startedKeyRef.current = null;
      setCreateError(false);
    }
  };

  return (
    <div className="my-2 flex justify-start">
      <Button
        size="sm"
        variant="outline"
        onClick={openMiniApp}
        disabled={(!miniAppId && !createError) || createMutation.isLoading}
      >
        <AppWindow className="mr-2 h-4 w-4" aria-hidden="true" />
        {miniAppId
          ? localize('com_ui_mini_apps_open')
          : createError
            ? localize('com_ui_mini_apps_retry')
            : localize('com_ui_mini_apps_creating')}
      </Button>
    </div>
  );
});

export default MiniAppOpenAction;
