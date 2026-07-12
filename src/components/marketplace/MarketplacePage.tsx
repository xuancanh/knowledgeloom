/**
 * MarketplacePage — browse community decks/collections, import them into your
 * vault (deck included, no AI cost), and publish your own shares.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  browseMarketplace, fetchMyListings, fetchMyShares, publishListing, importListing, unpublishListing, rateListing, reportListing,
  type MarketplaceListing,
} from '../../api';

function Stars({ value, count, onRate }: { value: number | null; count: number; onRate?: (stars: number) => void }) {
  const { t } = useTranslation();
  const rounded = value != null ? Math.round(value) : 0;
  return (
    <span className="mkt-stars" title={value != null ? t('marketplace.ratingSummary', { value, count }) : t('marketplace.noRatings')}>
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          className={`mkt-star${s <= rounded ? ' filled' : ''}${onRate ? ' ratable' : ''}`}
          disabled={!onRate}
          onClick={() => onRate?.(s)}
          aria-label={t('marketplace.rateStars', { count: s })}
        >
          ★
        </button>
      ))}
      <span className="mkt-star-count">{value != null ? `${value} (${count})` : t('marketplace.unrated')}</span>
    </span>
  );
}

function MarketplaceCard({
  listing, own, importing, confirmReport,
  onRate, onImport, onUnpublish, onStartReport, onConfirmReport, onCancelReport,
}: {
  listing: MarketplaceListing;
  own: boolean;
  importing: boolean;
  confirmReport: boolean;
  onRate: (stars: number) => void;
  onImport: () => void;
  onUnpublish: () => void;
  onStartReport: () => void;
  onConfirmReport: () => void;
  onCancelReport: () => void;
}) {
  const { t } = useTranslation();
  return (
    <article className="mkt-card">
      <div className="mkt-card-head">
        <strong>{listing.title}</strong>
        <span className={`today-chip ${listing.kind}`}>
          {listing.kind === 'category' ? t('marketplace.collection') : t('marketplace.deck')}
        </span>
      </div>
      {listing.description && <p className="mkt-desc">{listing.description}</p>}
      <Stars value={listing.avgStars} count={listing.ratingCount} onRate={own ? undefined : onRate} />
      <div className="mkt-meta">
        {listing.author && <span>{t('marketplace.byAuthor', { author: listing.author })}</span>}
        <span>{t('marketplace.importCount', { count: listing.imports })}</span>
        {listing.tags.map((tag) => <span key={tag} className="today-chip">#{tag}</span>)}
      </div>
      <div className="mkt-actions">
        {own ? (
          <button className="today-btn" onClick={onUnpublish}>{t('marketplace.unpublish')}</button>
        ) : (
          <>
            <button className="today-btn" disabled={importing} onClick={onImport}>
              {importing ? t('marketplace.importing') : t('marketplace.importAction')}
            </button>
            {confirmReport ? (
              <>
                <button className="today-btn mkt-report-confirm" onClick={onConfirmReport}>{t('marketplace.confirmReport')}</button>
                <button className="today-btn" onClick={onCancelReport}>{t('common.cancel')}</button>
              </>
            ) : (
              <button className="today-btn mkt-report" onClick={onStartReport}>{t('marketplace.report')}</button>
            )}
          </>
        )}
      </div>
    </article>
  );
}

function MarketplaceGrid({
  listings, own, importingId, confirmReportId,
  onRate, onImport, onUnpublish, onStartReport, onConfirmReport, onCancelReport,
}: {
  listings: MarketplaceListing[];
  own: boolean;
  importingId: string | null;
  confirmReportId: string | null;
  onRate: (listing: MarketplaceListing, stars: number) => void;
  onImport: (listing: MarketplaceListing) => void;
  onUnpublish: (listing: MarketplaceListing) => void;
  onStartReport: (listing: MarketplaceListing) => void;
  onConfirmReport: (listing: MarketplaceListing) => void;
  onCancelReport: () => void;
}) {
  return listings.map((listing) => (
    <MarketplaceCard
      key={listing.id}
      listing={listing}
      own={own}
      importing={importingId === listing.id}
      confirmReport={confirmReportId === listing.id}
      onRate={(stars) => onRate(listing, stars)}
      onImport={() => onImport(listing)}
      onUnpublish={() => onUnpublish(listing)}
      onStartReport={() => onStartReport(listing)}
      onConfirmReport={() => onConfirmReport(listing)}
      onCancelReport={onCancelReport}
    />
  ));
}

export default function MarketplacePage({ onOpenNote }: { onOpenNote: (id: string) => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'browse' | 'mine'>('browse');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [mine, setMine] = useState<MarketplaceListing[]>([]);
  const [shares, setShares] = useState<{ id: string; noteId: string; kind: string }[]>([]);
  const [message, setMessage] = useState('');
  const [importing, setImporting] = useState<string | null>(null);
  const [lastImportedNote, setLastImportedNote] = useState<string | null>(null);
  const [confirmReportId, setConfirmReportId] = useState<string | null>(null);

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
      setMessage(t('marketplace.importSuccess', {
        notes: r.imported.notes.length,
        flashcards: r.imported.flashcards,
        quiz: r.imported.quiz,
      }));
      setLastImportedNote(r.imported.notes[0] ?? null);
      loadBrowse();
    } catch {
      setMessage(t('marketplace.importFailed'));
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
      setMessage(t('marketplace.published'));
      loadMine();
    } catch {
      setMessage(t('marketplace.publishFailed'));
    }
  };

  const rate = (listing: MarketplaceListing, stars: number) => {
    rateListing(listing.id, stars)
      .then(() => { setMessage(t('marketplace.rated', { title: listing.title, stars })); loadBrowse(); })
      .catch(() => setMessage(t('marketplace.ratingFailed')));
  };

  const report = (listing: MarketplaceListing) => {
    reportListing(listing.id, 'Reported from marketplace')
      .then(() => {
        setMessage(t('marketplace.reported', { title: listing.title }));
        setConfirmReportId(null);
        loadBrowse();
      })
      .catch(() => setMessage(t('marketplace.reportFailed')));
  };

  return (
    <div className="today-page mkt-page">
      <header className="today-head">
        <h1>{t('marketplace.title')}</h1>
        <div className="today-counts">
          <button className={`today-chip mkt-tab${tab === 'browse' ? ' active' : ''}`} onClick={() => setTab('browse')}>{t('marketplace.browse')}</button>
          <button className={`today-chip mkt-tab${tab === 'mine' ? ' active' : ''}`} onClick={() => setTab('mine')}>{t('marketplace.myListings')}</button>
        </div>
      </header>

      {message && (
        <div className="mkt-message">
          {message}
          {lastImportedNote && <button className="today-note-ref" onClick={() => onOpenNote(lastImportedNote)}>{t('marketplace.openImported')} ↗</button>}
        </div>
      )}

      {tab === 'browse' ? (
        <>
          <div className="mkt-filters">
            <input aria-label={t('common.search')} placeholder={t('marketplace.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">{t('common.all')}</option>
              <option value="note">{t('marketplace.decks')}</option>
              <option value="category">{t('marketplace.collections')}</option>
            </select>
          </div>
          <div className="mkt-grid">
            {listings.length ? (
              <MarketplaceGrid
                listings={listings}
                own={false}
                importingId={importing}
                confirmReportId={confirmReportId}
                onRate={rate}
                onImport={(listing) => void doImport(listing)}
                onUnpublish={() => {}}
                onStartReport={(listing) => setConfirmReportId(listing.id)}
                onConfirmReport={report}
                onCancelReport={() => setConfirmReportId(null)}
              />
            ) : <div className="today-empty">{t('marketplace.empty')}</div>}
          </div>
        </>
      ) : (
        <>
          <section className="mkt-publish">
            <h3>{t('marketplace.publishShare')}</h3>
            {shares.length === 0 ? (
              <p className="import-sub">{t('marketplace.noShares')}</p>
            ) : (
              <div className="mkt-publish-form">
                <select value={pubShareId} onChange={(e) => setPubShareId(e.target.value)}>
                  <option value="">{t('marketplace.chooseShare')}</option>
                  {shares.map((s) => (
                    <option key={s.id} value={s.id}>{s.kind === 'category'
                      ? t('marketplace.collectionOption', { name: s.noteId })
                      : t('marketplace.noteOption', { name: s.noteId })}</option>
                  ))}
                </select>
                <input placeholder={t('marketplace.listingTitle')} value={pubTitle} onChange={(e) => setPubTitle(e.target.value)} />
                <input placeholder={t('marketplace.descriptionOptional')} value={pubDesc} onChange={(e) => setPubDesc(e.target.value)} />
                <input placeholder={t('marketplace.tagsOptional')} value={pubTags} onChange={(e) => setPubTags(e.target.value)} />
                <button className="today-btn" disabled={!pubShareId || !pubTitle.trim()} onClick={() => void doPublish()}>{t('marketplace.publish')}</button>
              </div>
            )}
          </section>
          <div className="mkt-grid">
            <MarketplaceGrid
              listings={mine}
              own
              importingId={importing}
              confirmReportId={confirmReportId}
              onRate={rate}
              onImport={(listing) => void doImport(listing)}
              onUnpublish={(listing) => void unpublishListing(listing.id).then(loadMine).catch(() => setMessage(t('marketplace.unpublishFailed')))}
              onStartReport={(listing) => setConfirmReportId(listing.id)}
              onConfirmReport={report}
              onCancelReport={() => setConfirmReportId(null)}
            />
          </div>
        </>
      )}
    </div>
  );
}
