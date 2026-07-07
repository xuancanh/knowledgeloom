import { useState } from 'react';
import { Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { useKnowledge, themeLabels, fontStyleLabels, type Theme } from './hooks/useKnowledge';
import { useAuth } from './hooks/useAuth';
import ActivityPage from './components/activity/ActivityPage';
import Home from './components/Home';
import Rail from './components/Rail';
import SearchOverlay from './components/SearchOverlay';
import SettingsPage from './components/settings/SettingsPage';
import { NoteRoute } from './components/routes/NoteRoute';
import { CategoryRoute } from './components/routes/CategoryRoute';
import { TagRoute } from './components/routes/TagRoute';
import { AllCategoriesRoute } from './components/routes/AllCategoriesRoute';
import { AllTagsRoute } from './components/routes/AllTagsRoute';
import { FlashcardsRoute } from './components/routes/FlashcardsRoute';
import { QuizRoute } from './components/routes/QuizRoute';
import { NewNoteRoute } from './components/routes/NewNoteRoute';
import { ClipRoute } from './components/routes/ClipRoute';
import ContextPanel from './components/ContextPanel';
import { ChatPanel } from './components/chat/ChatPanel';
import GraphPage from './components/graph/GraphPage';
import LearnPage from './components/learn/LearnPage';
import TodayPage from './components/study/TodayPage';
import ImportPage from './components/import/ImportPage';
import SharePage from './components/share/SharePage';
import MarketplacePage from './components/marketplace/MarketplacePage';
import { ext } from './lib/extensions';
import { getFeatures } from './lib/features';

// These pages come from the extension registry; in OSS builds they are
// undefined and the app boots straight into local mode at /home.
const LandingPage = ext.component('LandingPage');
const LoginPage = ext.component('LoginPage');

export default function App() {
  const { authenticated, loading: authLoading } = useAuth();

  if (authLoading) return null;

  return (
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
              <SettingsPage templates={templates} onTemplatesChange={setTemplates} userSettings={state.userSettings} />
            } />
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/login" element={<Navigate to="/home" replace />} />
          </Routes>
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

      {features.chat && <ChatPanel notes={state.notes} categories={categories} />}

      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.kind}`}>{toast.message}</div>
        ))}
      </div>
    </div>
  );
}
