/**
 * MarketplacePage — browse community decks/collections, import them into your
 * vault (deck included, no AI cost), and publish your own shares.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  browseMarketplace, fetchMyListings, fetchMyShares, publishListing, importListing, unpublishListing, rateListing,
  type MarketplaceListing,
} from '../../api';

function Stars({ value, count, onRate }: { value: number | null; count: number; onRate?: (stars: number) => void }) {
  const rounded = value != null ? Math.round(value) : 0;
  return (
    <span className="mkt-stars" title={value != null ? `${value} from ${count} rating${count === 1 ? '' : 's'}` : 'No ratings yet'}>
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          className={`mkt-star${s <= rounded ? ' filled' : ''}${onRate ? ' ratable' : ''}`}
          disabled={!onRate}
          onClick={() => onRate?.(s)}
          aria-label={`Rate ${s} star${s === 1 ? '' : 's'}`}
        >
          ★
        </button>
      ))}
      <span className="mkt-star-count">{value != null ? `${value} (${count})` : 'unrated'}</span>
    </span>
  );
}

export default function MarketplacePage({ onOpenNote }: { onOpenNote: (id: string) => void }) {
  const [tab, setTab] = useState<'browse' | 'mine'>('browse');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [mine, setMine] = useState<MarketplaceListing[]>([]);
  const [shares, setShares] = useState<{ id: string; noteId: string; kind: string }[]>([]);
  const [message, setMessage] = useState('');
  const [importing, setImporting] = useState<string | null>(null);
  const [lastImportedNote, setLastImportedNote] = useState<string | null>(null);

  // Publish form
  const [pubShareId, setPubShareId] = useState('');
  const [pubTitle, setPubTitle] = useState('');
  const [pubDesc, setPubDesc] = useState('');
  const [pubTags, setPubTags] = useState('');

  const loadBrowse = useCallback(() => {
    browseMarketplace(q, kind).then((r) => setListings(r.listings)).catch(() => setListings([]));
  }, [q, kind]);

  const loadMine = useCallback(() => {
    fetchMyListings().then((r) => setMine(r.listings)).catch(() => setMine([]));
    fetchMyShares().then((r) => setShares(r.shares)).catch(() => setShares([]));
  }, []);

  useEffect(() => { loadBrowse(); }, [loadBrowse]);
  useEffect(() => { if (tab === 'mine') loadMine(); }, [tab, loadMine]);

  const doImport = async (l: MarketplaceListing) => {
    setImporting(l.id);
    setMessage('');
    try {
      const r = await importListing(l.id);
      setMessage(`Imported ${r.imported.notes.length} note${r.imported.notes.length === 1 ? '' : 's'}, ${r.imported.flashcards} flashcards, ${r.imported.quiz} quiz questions.`);
      setLastImportedNote(r.imported.notes[0] ?? null);
      loadBrowse();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setImporting(null);
    }
  };

  const doPublish = async () => {
    if (!pubShareId || !pubTitle.trim()) return;
    setMessage('');
    try {
      await publishListing({
        shareId: pubShareId,
        title: pubTitle.trim(),
        description: pubDesc.trim(),
        tags: pubTags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      setPubTitle(''); setPubDesc(''); setPubTags(''); setPubShareId('');
      setMessage('Published.');
      loadMine();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Publish failed.');
    }
  };

  const card = (l: MarketplaceListing, own: boolean) => (
    <div key={l.id} className="mkt-card">
      <div className="mkt-card-head">
        <strong>{l.title}</strong>
        <span className={`today-chip ${l.kind}`}>{l.kind === 'category' ? 'collection' : 'deck'}</span>
      </div>
      {l.description && <p className="mkt-desc">{l.description}</p>}
      <Stars
        value={l.avgStars}
        count={l.ratingCount}
        onRate={own ? undefined : (stars) => {
          rateListing(l.id, stars)
            .then(() => { setMessage(`Rated “${l.title}” ${stars}★.`); loadBrowse(); })
            .catch((err) => setMessage(err instanceof Error ? err.message : 'Rating failed.'));
        }}
      />
      <div className="mkt-meta">
        {l.author && <span>by {l.author}</span>}
        <span>{l.imports} import{l.imports === 1 ? '' : 's'}</span>
        {l.tags.map((t) => <span key={t} className="today-chip">#{t}</span>)}
      </div>
      <div className="mkt-actions">
        {own ? (
          <button className="today-btn" onClick={() => unpublishListing(l.id).then(loadMine).catch(() => {})}>Unpublish</button>
        ) : (
          <button className="today-btn" disabled={importing === l.id} onClick={() => void doImport(l)}>
            {importing === l.id ? 'Importing…' : 'Import to my vault'}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="today-page mkt-page">
      <header className="today-head">
        <h1>Marketplace</h1>
        <div className="today-counts">
          <button className={`today-chip mkt-tab${tab === 'browse' ? ' active' : ''}`} onClick={() => setTab('browse')}>Browse</button>
          <button className={`today-chip mkt-tab${tab === 'mine' ? ' active' : ''}`} onClick={() => setTab('mine')}>My listings</button>
        </div>
      </header>

      {message && (
        <div className="mkt-message">
          {message}
          {lastImportedNote && <button className="today-note-ref" onClick={() => onOpenNote(lastImportedNote)}>Open imported note ↗</button>}
        </div>
      )}

      {tab === 'browse' ? (
        <>
          <div className="mkt-filters">
            <input placeholder="Search decks and collections…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">All</option>
              <option value="note">Decks</option>
              <option value="category">Collections</option>
            </select>
          </div>
          <div className="mkt-grid">
            {listings.length ? listings.map((l) => card(l, false)) : <div className="today-empty">No listings yet — publish the first one.</div>}
          </div>
        </>
      ) : (
        <>
          <section className="mkt-publish">
            <h3>Publish a share</h3>
            {shares.length === 0 ? (
              <p className="import-sub">Create a share first (Share button on any note or category page), then publish it here.</p>
            ) : (
              <div className="mkt-publish-form">
                <select value={pubShareId} onChange={(e) => setPubShareId(e.target.value)}>
                  <option value="">Choose a share…</option>
                  {shares.map((s) => (
                    <option key={s.id} value={s.id}>{s.kind === 'category' ? `Collection: ${s.noteId}` : `Note: ${s.noteId}`}</option>
                  ))}
                </select>
                <input placeholder="Listing title" value={pubTitle} onChange={(e) => setPubTitle(e.target.value)} />
                <input placeholder="Description (optional)" value={pubDesc} onChange={(e) => setPubDesc(e.target.value)} />
                <input placeholder="Tags, comma-separated (optional)" value={pubTags} onChange={(e) => setPubTags(e.target.value)} />
                <button className="today-btn" disabled={!pubShareId || !pubTitle.trim()} onClick={() => void doPublish()}>Publish</button>
              </div>
            )}
          </section>
          <div className="mkt-grid">
            {mine.map((l) => card(l, true))}
          </div>
        </>
      )}
    </div>
  );
}
