import { lazy, Suspense, useState } from 'react';
import { Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useKnowledge, themeLabels, fontStyleLabels, type Theme } from './hooks/useKnowledge';
import { useAuth } from './hooks/useAuth';
import Rail from './components/Rail';
import SearchOverlay from './components/SearchOverlay';
import ContextPanel from './components/ContextPanel';
import { ext } from './lib/extensions';
import { getFeatures } from './lib/features';

const ActivityPage = lazy(() => import('./components/activity/ActivityPage'));
const Home = lazy(() => import('./components/Home'));
const SettingsPage = lazy(() => import('./components/settings/SettingsPage'));
const NoteRoute = lazy(() => import('./components/routes/NoteRoute').then((module) => ({ default: module.NoteRoute })));
const CategoryRoute = lazy(() => import('./components/routes/CategoryRoute').then((module) => ({ default: module.CategoryRoute })));
const TagRoute = lazy(() => import('./components/routes/TagRoute').then((module) => ({ default: module.TagRoute })));
const AllCategoriesRoute = lazy(() => import('./components/routes/AllCategoriesRoute').then((module) => ({ default: module.AllCategoriesRoute })));
const AllTagsRoute = lazy(() => import('./components/routes/AllTagsRoute').then((module) => ({ default: module.AllTagsRoute })));
const FlashcardsRoute = lazy(() => import('./components/routes/FlashcardsRoute').then((module) => ({ default: module.FlashcardsRoute })));
const QuizRoute = lazy(() => import('./components/routes/QuizRoute').then((module) => ({ default: module.QuizRoute })));
const NewNoteRoute = lazy(() => import('./components/routes/NewNoteRoute').then((module) => ({ default: module.NewNoteRoute })));
const ClipRoute = lazy(() => import('./components/routes/ClipRoute').then((module) => ({ default: module.ClipRoute })));
const ChatPanel = lazy(() => import('./components/chat/ChatPanel').then((module) => ({ default: module.ChatPanel })));
const GraphPage = lazy(() => import('./components/graph/GraphPage'));
const LearnPage = lazy(() => import('./components/learn/LearnPage'));
const TodayPage = lazy(() => import('./components/study/TodayPage'));
const ImportPage = lazy(() => import('./components/import/ImportPage'));
const SharePage = lazy(() => import('./components/share/SharePage'));
const MarketplacePage = lazy(() => import('./components/marketplace/MarketplacePage'));

function RouteLoading() {
  const { t } = useTranslation();
  return <div className="today-empty" role="status">{t('common.loading')}</div>;
}

// These pages come from the extension registry; in OSS builds they are
// undefined and the app boots straight into local mode at /home.
const LandingPage = ext.component('LandingPage');
const LoginPage = ext.component('LoginPage');

export default function App() {
  const { authenticated, loading: authLoading } = useAuth();

  if (authLoading) return null;

  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        {/* Public share links work without any authentication. */}
        <Route path="/share/:id" element={<SharePage />} />
        <Route path="/" element={LandingPage ? <LandingPage /> : <Navigate to="/home" replace />} />
        {LoginPage && (
          <Route path="/login" element={authenticated ? <Navigate to="/home" replace /> : <LoginPage />} />
        )}
        {authenticated
          ? <Route path="*" element={<AuthenticatedApp />} />
          : <Route path="*" element={<Navigate to="/" replace />} />
        }
      </Routes>
    </Suspense>
  );
}

function AuthenticatedApp() {
  const location = useLocation();
  const isGraph = location.pathname === '/graph';
  const isLearn = location.pathname === '/learn';
  const [themeDropOpen, setThemeDropOpen] = useState(false);

  const {
    state, jobs, reminders, searchOpen, setSearchOpen, theme, setTheme, fontStyle, setFontStyle,
    compactMode, setCompactMode, readOnly, toasts, railOpen, setRailOpen,
    templates, setTemplates, catSearch, setCatSearch, tagSearch, setTagSearch,
    categories, categoryTree, categoryById, tagCounts, currentNote,
    showContextPanel, inFlightCount, openNote, openCategory, openTag, goHome,
    openActivity, openSettings, openFlashcards, openQuiz, openAllCategories, openAllTags, openGraph, openLearn, openToday, openMarketplace,
    graphAddLink, graphRemoveLink, graphCreateNote, graphDeleteNote, graphRenameNote, graphSetCategory,
    handleDelete, handleSaveNote,
    handleAssistNote, submitCapture, handleCreateReminder, handleCompleteReminder,
    handleDeleteReminder,
  } = useKnowledge();

  // Granular feature toggles (Settings → Features). Disabled features are
  // hidden from navigation and their routes bounce back to the desk.
  const features = getFeatures(state.userSettings);

  return (
    <div className={`app${(showContextPanel && !isGraph && !isLearn) ? '' : ' no-right'}${compactMode ? ' dense' : ''}`}>

      <Rail
        categories={categories}
        categoryTree={categoryTree}
        flashcardCount={state.flashcards?.length || 0}
        quizCount={state.quizQuestions?.length || 0}
        inFlightCount={inFlightCount}
        tagCounts={tagCounts}
        catSearch={catSearch}
        tagSearch={tagSearch}
        railOpen={railOpen}
        onCatSearchChange={setCatSearch}
        onTagSearchChange={setTagSearch}
        onHome={goHome}
        onSearch={() => setSearchOpen(true)}
        onActivity={openActivity}
        onFlashcards={openFlashcards}
        onQuiz={openQuiz}
        onGraph={openGraph}
        onLearn={openLearn}
        onToday={openToday}
        onMarketplace={openMarketplace}
        onSettings={openSettings}
        features={features}
        openCategory={openCategory}
        openTag={openTag}
        closeRail={() => setRailOpen(false)}
        onViewAllCategories={openAllCategories}
        onViewAllTags={openAllTags}
      />

      {railOpen && <div className="rail-backdrop" onClick={() => setRailOpen(false)} />}

      <main className={isGraph || isLearn ? 'graph-main' : ''}>
        {!isGraph && !isLearn && <div className="utility">
          <button className="rail-toggle" onClick={() => setRailOpen(true)} aria-label="Open menu">
            <span>☰</span>
          </button>
          <button className="search-trigger" onClick={() => setSearchOpen(true)}>
            <span className="glyph">⌕</span>
            <span className="search-hint">Search notes, tags, categories…</span>
            <kbd>⌘K</kbd>
          </button>
          <div className="util-actions">
            <div className="theme-drop-wrap">
              {themeDropOpen && <div className="theme-drop-backdrop" onClick={() => setThemeDropOpen(false)} />}
              <button className={themeDropOpen ? 'theme-drop-trigger open' : 'theme-drop-trigger'} onClick={() => setThemeDropOpen((v) => !v)}>
                <span className="glyph">{themeLabels[theme].icon}</span>
                <span className="util-label">{themeLabels[theme].label}</span>
                <span className="util-arrow">▾</span>
              </button>
              {themeDropOpen && (
                <div className="theme-drop">
                  {(Object.entries(themeLabels) as [Theme, typeof themeLabels[Theme]][]).map(([key, val]) => (
                    <button
                      key={key}
                      className={theme === key ? 'active' : ''}
                      onClick={() => { setTheme(key); setThemeDropOpen(false); }}
                    >
                      <span>{val.icon}</span>
                      {val.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setFontStyle((v) => fontStyleLabels[v].next)} title={fontStyleLabels[fontStyle].label}>
              <span className="glyph">{fontStyleLabels[fontStyle].icon}</span>
              <span className="util-label">{fontStyleLabels[fontStyle].label}</span>
            </button>
            <button onClick={() => setCompactMode((v) => !v)} title={compactMode ? 'Comfort' : 'Compact'}>
              <span className="glyph">{compactMode ? '▤' : '□'}</span>
              <span className="util-label">{compactMode ? 'Compact' : 'Comfort'}</span>
            </button>
            <button onClick={goHome} title="Desk">
              <span className="glyph">✦</span>
              <span className="util-label">Desk</span>
            </button>
          </div>
        </div>}

        <div className={isGraph || isLearn ? 'graph-slot' : 'main'}>
          <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/home" element={
              <Home
                notes={state.notes}
                categories={categories}
                flashcards={state.flashcards || []}
                reminders={reminders}
                readNoteIds={state.readNoteIds}
                onOpen={openNote}
                onOpenTag={openTag}
                onOpenFlashcards={openFlashcards}
                onCompleteReminder={handleCompleteReminder}
                onSubmit={submitCapture}
                readOnly={readOnly}
                templates={templates}
                userSettings={state.userSettings}
              />
            } />
            <Route path="/activity" element={
              <ActivityPage jobs={jobs} onOpenNote={openNote} />
            } />
            <Route path="/flashcards/*" element={
              !features.flashcards ? <Navigate to="/home" replace /> :
              <FlashcardsRoute
                flashcards={state.flashcards || []}
                notes={state.notes}
                categories={categories}
                tagCounts={tagCounts}
                onScopeChange={openFlashcards}
                onOpenNote={openNote}
              />
            } />
            <Route path="/quiz/*" element={
              !features.quiz ? <Navigate to="/home" replace /> :
              <QuizRoute
                questions={state.quizQuestions || []}
                categories={categories}
                tagCounts={tagCounts}
                onScopeChange={openQuiz}
              />
            } />
            <Route path="/notes/:id" element={
              <NoteRoute
                notes={state.notes}
                categories={categories}
                readOnly={readOnly}
                reminders={reminders}
                readCounts={state.readCounts}
                onOpenCategory={openCategory}
                onOpenTag={openTag}
                onSave={handleSaveNote}
                onAssist={handleAssistNote}
                onDelete={handleDelete}
                onCreateReminder={handleCreateReminder}
                onCompleteReminder={handleCompleteReminder}
                onDeleteReminder={handleDeleteReminder}
              />
            } />
            <Route path="/categories">
              <Route index element={
                <AllCategoriesRoute categories={categories} categoryTree={categoryTree} onOpenCategory={openCategory} />
              } />
              <Route path="*" element={
                <CategoryRoute
                  notes={state.notes}
                  categories={categories}
                  categoryById={categoryById}
                  flashcards={state.flashcards || []}
                  readNoteIds={state.readNoteIds}
                  onOpen={openNote}
                  onOpenTag={openTag}
                  onOpenCategory={openCategory}
                  onOpenFlashcards={(cat) => openFlashcards('category', cat)}
                />
              } />
            </Route>
            <Route path="/tags">
              <Route index element={
                <AllTagsRoute tagCounts={tagCounts} onOpenTag={openTag} />
              } />
              <Route path=":tag" element={
                <TagRoute
                  notes={state.notes}
                  categories={categories}
                  flashcards={state.flashcards || []}
                  readNoteIds={state.readNoteIds}
                  onOpen={openNote}
                  onOpenTag={openTag}
                  onOpenFlashcards={(t) => openFlashcards('tag', t)}
                />
              } />
            </Route>
            <Route path="/new" element={
              <NewNoteRoute
                notes={state.notes}
                categories={categories}
                onSubmit={submitCapture}
                readOnly={readOnly}
              />
            } />
            <Route path="/graph" element={
              <GraphPage
                state={state}
                categories={categories}
                tagCounts={tagCounts}
                onAddLink={graphAddLink}
                onRemoveLink={graphRemoveLink}
                onAddNote={graphCreateNote}
                onDeleteNote={graphDeleteNote}
                onRenameNote={graphRenameNote}
                onSetCategory={graphSetCategory}
              />
            } />
            <Route path="/learn" element={
              !features.learn ? <Navigate to="/home" replace /> :
              <LearnPage
                notes={state.notes}
                categories={categories}
                onExit={goHome}
              />
            } />
            <Route path="/today" element={
              !features.today ? <Navigate to="/home" replace /> :
              <TodayPage onOpenNote={openNote} />
            } />
            <Route path="/import" element={
              <ImportPage onOpenNote={openNote} />
            } />
            <Route path="/marketplace" element={
              !features.marketplace ? <Navigate to="/home" replace /> :
              <MarketplacePage onOpenNote={openNote} />
            } />
            <Route path="/clip" element={<ClipRoute />} />
            <Route path="/settings" element={
              <SettingsPage templates={templates} onTemplatesChange={setTemplates} userSettings={state.userSettings} readOnly={readOnly} />
            } />
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/login" element={<Navigate to="/home" replace />} />
          </Routes>
          </Suspense>
        </div>
      </main>

      {showContextPanel && currentNote && (
        <ContextPanel note={currentNote} notes={state.notes} onOpen={openNote} />
      )}

      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        notes={state.notes}
        categories={categories}
        onOpen={openNote}
      />

      {features.chat && (
        <Suspense fallback={null}>
          <ChatPanel notes={state.notes} categories={categories} />
        </Suspense>
      )}

      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.kind}`}>{toast.message}</div>
        ))}
      </div>
    </div>
  );
}
