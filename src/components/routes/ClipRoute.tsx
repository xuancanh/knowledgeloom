/**
 * ClipRoute — target of the bookmarklet clipper (/clip?url=…&title=…).
 * Queues a link-mode AI capture for the clipped page and shows progress.
 */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { submitLearning } from '../../api';

export function ClipRoute() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'working' | 'done' | 'error'>('working');
  const [message, setMessage] = useState('Clipping…');
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const url = params.get('url') || '';
    const title = params.get('title') || '';
    if (!url) {
      setStatus('error');
      setMessage('No URL to clip.');
      return;
    }
    submitLearning({ mode: 'link', url, title } as any)
      .then(() => {
        setStatus('done');
        setMessage('Clipped — the AI is turning the page into a note.');
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Clip failed.');
      });
  }, [params]);

  return (
    <div className="today-page">
      <header className="today-head"><h1>Web clipper</h1></header>
      <p className={`import-status ${status === 'error' ? 'error' : status === 'done' ? 'done' : ''}`}>{message}</p>
      {status !== 'working' && (
        <div className="import-actions">
          <button className="today-btn" onClick={() => navigate('/activity')}>View activity</button>
          <button className="today-btn" onClick={() => navigate('/home')}>Back to desk</button>
        </div>
      )}
    </div>
  );
}
