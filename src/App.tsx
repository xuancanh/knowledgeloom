import { useState } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
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
import { NewNoteRoute } from './components/routes/NewNoteRoute';
import ContextPanel from './components/ContextPanel';
import { ChatPanel } from './components/chat/ChatPanel';
import { LandingPage } from './components/landing/LandingPage';
import { LoginPage } from './components/auth/LoginPage';

export default function App() {
  const { session, loading: authLoading } = useAuth();

  if (authLoading) return null;

  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<LandingPage />} />
      </Routes>
    );
  }

  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const [themeDropOpen, setThemeDropOpen] = useState(false);

  const {
    state, jobs, reminders, searchOpen, setSearchOpen, theme, setTheme, fontStyle, setFontStyle,
    compactMode, setCompactMode, readOnly, toasts, railOpen, setRailOpen,
    templates, setTemplates, catSearch, setCatSearch, tagSearch, setTagSearch,
    categories, categoryTree, categoryById, tagCounts, currentNote,
    showContextPanel, inFlightCount, openNote, openCategory, openTag, goHome,
    openActivity, openSettings, openFlashcards, openAllCategories, openAllTags, handleDelete, handleSaveNote,
    handleAssistNote, submitCapture, handleCreateReminder, handleCompleteReminder,
    handleDeleteReminder,
  } = useKnowledge();

  return (
    <div className={`app${showContextPanel ? '' : ' no-right'}${compactMode ? ' dense' : ''}`}>

      <Rail
        categories={categories}
        categoryTree={categoryTree}
        flashcardCount={state.flashcards?.length || 0}
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
        onSettings={openSettings}
        openCategory={openCategory}
        openTag={openTag}
        closeRail={() => setRailOpen(false)}
        onViewAllCategories={openAllCategories}
        onViewAllTags={openAllTags}
      />

      {railOpen && <div className="rail-backdrop" onClick={() => setRailOpen(false)} />}

      <main>
        <div className="utility">
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
        </div>

        <div className="main">
          <Routes>
            <Route path="/" element={
              <Home
                notes={state.notes}
                categories={categories}
                reminders={reminders}
                onOpen={openNote}
                onOpenTag={openTag}
                onCompleteReminder={handleCompleteReminder}
                onSubmit={submitCapture}
                readOnly={readOnly}
                templates={templates}
              />
            } />
            <Route path="/activity" element={
              <ActivityPage jobs={jobs} onOpenNote={openNote} />
            } />
            <Route path="/flashcards/*" element={
              <FlashcardsRoute
                flashcards={state.flashcards || []}
                notes={state.notes}
                categories={categories}
                tagCounts={tagCounts}
                onScopeChange={openFlashcards}
                onOpenNote={openNote}
              />
            } />
            <Route path="/notes/:id" element={
              <NoteRoute
                notes={state.notes}
                categories={categories}
                readOnly={readOnly}
                reminders={reminders}
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
                  onOpen={openNote}
                  onOpenTag={openTag}
                  onOpenFlashcards={(t) => openFlashcards('tag', t)}
                />
              } />
            </Route>
            <Route path="/new" element={
              <NewNoteRoute onSubmit={submitCapture} readOnly={readOnly} />
            } />
            <Route path="/settings" element={
              <SettingsPage templates={templates} onTemplatesChange={setTemplates} />
            } />
            <Route path="/login" element={<Navigate to="/" replace />} />
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

      <ChatPanel notes={state.notes} categories={categories} />

      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.kind}`}>{toast.message}</div>
        ))}
      </div>
    </div>
  );
}
