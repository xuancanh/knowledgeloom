/**
 * ClipRoute — target of the bookmarklet clipper (/clip?url=…&title=…).
 * Queues a link-mode AI capture for the clipped page and shows progress.
 */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { submitLearning } from '../../api';
import { useTranslation } from 'react-i18next';

export function ClipRoute() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [status, setStatus] = useState<'working' | 'done' | 'error'>('working');
  const [message, setMessage] = useState(() => t('clip.clipping'));
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const url = params.get('url') || '';
    const title = params.get('title') || '';
    if (!url) {
      setStatus('error');
      setMessage(t('clip.noUrl'));
      return;
    }
    submitLearning({ mode: 'link', url, title } as any)
      .then(() => {
        setStatus('done');
        setMessage(t('clip.queued'));
      })
      .catch(() => {
        setStatus('error');
        setMessage(t('clip.failed'));
      });
  }, [params, t]);

  return (
    <div className="today-page">
      <header className="today-head"><h1>{t('clip.title')}</h1></header>
      <p className={`import-status ${status === 'error' ? 'error' : status === 'done' ? 'done' : ''}`}>{message}</p>
      {status !== 'working' && (
        <div className="import-actions">
          <button className="today-btn" onClick={() => navigate('/activity')}>{t('clip.viewActivity')}</button>
          <button className="today-btn" onClick={() => navigate('/home')}>{t('clip.backToDesk')}</button>
        </div>
      )}
    </div>
  );
}
