import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { RagScope, KnowledgeNote, KnowledgeCategory } from '../../types';
import { useRagChat } from '../../hooks/useRagChat';
import styles from './ChatPanel.module.css';

interface Props {
  notes: KnowledgeNote[];
  categories: KnowledgeCategory[];
}

function detectScope(
  pathname: string,
  notes: KnowledgeNote[],
  categories: KnowledgeCategory[],
): RagScope {
  const noteMatch = pathname.match(/^\/notes\/(.+)$/);
  if (noteMatch) {
    const id = decodeURIComponent(noteMatch[1]);
    if (notes.some((n) => n.id === id)) return { type: 'note', id };
  }
  const tagMatch = pathname.match(/^\/tags\/(.+)$/);
  if (tagMatch) return { type: 'tag', tag: decodeURIComponent(tagMatch[1]) };
  const catMatch = pathname.match(/^\/categories\/(.+)$/);
  if (catMatch) {
    const path = decodeURIComponent(catMatch[1]);
    if (categories.some((c) => c.slug === path || c.name === path))
      return { type: 'category', path };
  }
  return { type: 'all' };
}

function scopeLabel(scope: RagScope, notes: KnowledgeNote[], categories: KnowledgeCategory[]): string {
  if (scope.type === 'all') return 'All notes';
  if (scope.type === 'note') {
    const note = notes.find((n) => n.id === scope.id);
    return note ? note.title : 'This note';
  }
  if (scope.type === 'category') {
    const cat = categories.find((c) => c.slug === scope.path || c.name === scope.path);
    return cat?.name || scope.path;
  }
  if (scope.type === 'tag') return `#${scope.tag}`;
  return 'All notes';
}

function isSameScope(a: RagScope, b: RagScope): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'note' && b.type === 'note') return a.id === b.id;
  if (a.type === 'category' && b.type === 'category') return a.path === b.path;
  if (a.type === 'tag' && b.type === 'tag') return a.tag === b.tag;
  return true;
}

export function ChatPanel({ notes, categories }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const location = useLocation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function getScopeLabel(scope: RagScope): string {
    if (scope.type === 'all') return t('chat.allNotes');
    if (scope.type === 'note') {
      const note = notes.find((n) => n.id === scope.id);
      return note ? note.title : t('chat.thisNote');
    }
    if (scope.type === 'category') {
      const cat = categories.find((c) => c.slug === scope.path || c.name === scope.path);
      return cat?.name || scope.path;
    }
    if (scope.type === 'tag') return `#${scope.tag}`;
    return t('chat.allNotes');
  }

  const { messages, streaming, sendMessage, abort, clearHistory } = useRagChat();

  const [scope, setScope] = useState<RagScope>(() =>
    detectScope(location.pathname, notes, categories),
  );

  const prevPathRef = useRef(location.pathname);
  useEffect(() => {
    if (prevPathRef.current !== location.pathname) {
      prevPathRef.current = location.pathname;
      setScope(detectScope(location.pathname, notes, categories));
    }
  }, [location.pathname, notes, categories]);

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 130) + 'px';
  }, []);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text || streaming) return;
    setInputValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    sendMessage(text, scope);
  }, [inputValue, streaming, scope, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        streaming ? abort() : handleSend();
      }
      if (e.key === 'Escape') setOpen(false);
    },
    [streaming, abort, handleSend],
  );

  const detectedScope = detectScope(location.pathname, notes, categories);
  const scopeOptions: RagScope[] = [
    { type: 'all' },
    ...(detectedScope.type !== 'all' ? [detectedScope] : []),
  ];

  return (
    <>
      <button
        className={`${styles.chatBtn}${open ? ` ${styles.open}` : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={open ? t('chat.closeAria') : t('chat.openBtn')}
        aria-label={open ? t('chat.closeAria') : t('chat.openBtn')}
      >
        <span className={styles.chatBtnDot} />
        {open ? t('chat.closeBtn') : t('chat.openBtn')}
      </button>

      {open && <div className={styles.backdrop} onClick={() => setOpen(false)} />}

      <div
        className={`${styles.panel}${open ? ` ${styles.visible}` : ''}`}
        role="dialog"
        aria-label={t('chat.titleAskAi')}
      >
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLabel}>
            <span className={styles.headerDot} />
            <h2 className={styles.headerTitle}>{t('chat.titleAskAi')}</h2>
          </div>
          <div className={styles.headerActions}>
            {messages.length > 0 && (
              <button className={styles.iconBtn} onClick={clearHistory}>
                {t('chat.clearHistory')}
              </button>
            )}
            <button className={styles.iconBtn} onClick={() => setOpen(false)} aria-label={t('chat.closeBtn')}>
              ✕
            </button>
          </div>
        </div>

        {/* Scope selector */}
        <div className={styles.scopeBar}>
          <span className={styles.scopeKey}>{t('chat.scope')}</span>
          <div className={styles.scopeChips}>
            {scopeOptions.map((opt, i) => (
              <button
                key={i}
                className={`${styles.chip}${isSameScope(scope, opt) ? ` ${styles.chipActive}` : ''}`}
                onClick={() => setScope(opt)}
                title={getScopeLabel(opt)}
              >
                {getScopeLabel(opt)}
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div className={styles.messages}>
          {messages.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>◎</div>
              <p className={styles.emptyTitle}>{t('chat.emptyTitle')}</p>
              <p className={styles.emptyHint}>{t('chat.emptyHint')}</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`${styles.msgRow} ${msg.role === 'user' ? styles.roleUser : styles.roleAssistant}`}
              >
                <div className={styles.msgRole}>
                  {msg.role === 'user' ? t('chat.you') : t('chat.ai')}
                </div>
                <div className={styles.msgBubble}>
                  {msg.content}
                  {msg.streaming && <span className={styles.cursor} />}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className={styles.inputBar}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={inputValue}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.placeholder')}
            rows={1}
          />
          <button
            className={`${styles.sendBtn}${streaming ? ` ${styles.stopBtn}` : ''}`}
            onClick={streaming ? abort : handleSend}
            disabled={!streaming && !inputValue.trim()}
          >
            {streaming ? t('chat.stop') : t('chat.ask')}
          </button>
        </div>
      </div>
    </>
  );
}
