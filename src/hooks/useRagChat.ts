import { useState, useRef, useCallback, useEffect } from 'react';
import type { ChatMessage, RagScope } from '../types';
import { streamRagAnswer } from '../api';

const STORAGE_KEY = 'kl:chat-history';
const MAX_STORED = 200;

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((m) => ({ ...m, streaming: false })) : [];
  } catch {
    return [];
  }
}

function saveMessages(msgs: ChatMessage[]) {
  try {
    // Drop streaming flag and keep only the latest MAX_STORED messages.
    const toSave = msgs
      .filter((m) => !m.streaming)
      .slice(-MAX_STORED)
      .map(({ streaming: _s, ...m }) => m);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // Ignore quota errors.
  }
}

export function useRagChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Persist after every settled update (not during streaming — too frequent).
  useEffect(() => {
    if (!streaming) saveMessages(messages);
  }, [messages, streaming]);

  const sendMessage = useCallback(async (text: string, scope: RagScope) => {
    const userMsg: ChatMessage = { id: makeId(), role: 'user', content: text };
    const assistantId = makeId();
    const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', content: '', streaming: true };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setStreaming(true);

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      for await (const token of streamRagAnswer(text, scope, history, ctrl.signal)) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + token } : m,
          ),
        );
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content || `[Error: ${err?.message || 'Unknown error'}]` }
              : m,
          ),
        );
      }
    } finally {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)),
      );
      setStreaming(false);
      abortRef.current = null;
    }
  }, [messages]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearHistory = useCallback(() => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { messages, streaming, sendMessage, abort, clearHistory };
}
