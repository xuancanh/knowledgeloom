import { useTranslation } from 'react-i18next';
import type { KnowledgeNote } from '../types';
import { formatCreated } from '../lib/view';
import MiniGraph from './MiniGraph';

/**
 * Right sidebar shown when a note is selected.
 *
 * Displays: connection graph (MiniGraph), outgoing links, backlinks, and file
 * metadata. All data is pure presentation — no state, no fetch.
 */
export default function ContextPanel({
  note,
  notes,
  onOpen,
}: {
  note: KnowledgeNote;
  notes: KnowledgeNote[];
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const backlinks = notes.filter((n) => n.links.includes(note.id));

  return (
    <aside className="context">
      <div className="ctx-block">
        <h3>{t('notes.connections')}</h3>
        <MiniGraph note={note} notes={notes} onOpen={onOpen} />
      </div>
      <div className="ctx-block">
        <h3>{t('notes.linksOutCount', { count: note.links.length })}</h3>
        <ul className="link-list">
          {note.links.map((id) => {
            const linked = notes.find((n) => n.id === id);
            if (!linked) return null;
            return (
              <li key={id} onClick={() => onOpen(id)}>
                <span className="arrow">↗</span>
                <div>
                  <div className="ltitle">{linked.title}</div>
                  <div className="lcat">{linked.category} · {formatCreated(linked.createdAt)}</div>
                </div>
              </li>
            );
          })}
          {note.links.length === 0 && <li className="muted-row">{t('notes.noLinksYet')}</li>}
        </ul>
      </div>
      <div className="ctx-block">
        <h3>{t('notes.backlinksCount', { count: backlinks.length })}</h3>
        <ul className="link-list">
          {backlinks.map((n) => (
            <li key={n.id} onClick={() => onOpen(n.id)}>
              <span className="arrow">↘</span>
              <div>
                <div className="ltitle">{n.title}</div>
                <div className="lcat">{n.category} · {formatCreated(n.createdAt)}</div>
              </div>
            </li>
          ))}
          {backlinks.length === 0 && <li className="muted-row">{t('notes.noBacklinksYet')}</li>}
        </ul>
      </div>
      <div className="ctx-block">
        <h3>{t('notes.fileInfo')}</h3>
        <div className="fine">
          <div><b>{note.id}.md</b></div>
          <div style={{ marginTop: 4 }}>vault / {note.category}</div>
          <div style={{ marginTop: 4 }}>indexed · meilisearch</div>
        </div>
      </div>
    </aside>
  );
}
