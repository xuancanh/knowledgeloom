import { Route, Routes } from 'react-router-dom';
import { useKnowledge, themeLabels } from './hooks/useKnowledge';
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
import ContextPanel from './components/ContextPanel';

/**
 * Root application component.
 *
 * Calls `useKnowledge()` for all state, polled data, navigation callbacks, and
 * mutation handlers. Renders the layout shell: Rail (left sidebar), utility bar,
 * route content (via react-router <Routes>), ContextPanel (right sidebar),
 * SearchOverlay (command palette), and toast notification stack.
 */
export default function App() {
  const {
    state, jobs, reminders, searchOpen, setSearchOpen, theme, setTheme,
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
            <button onClick={() => setTheme((v) => themeLabels[v].next)} title={themeLabels[theme].label}>
              <span className="glyph">{themeLabels[theme].icon}</span>
              <span className="util-label">{themeLabels[theme].label}</span>
            </button>
            <button onClick={() => setCompactMode((v) => !v)} title={compactMode ? 'Comfort' : 'Compact'}>
              <span className="glyph">{compactMode ? '□' : '▤'}</span>
              <span className="util-label">{compactMode ? 'Comfort' : 'Compact'}</span>
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
                <AllCategoriesRoute categories={categories} onOpenCategory={openCategory} />
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
            <Route path="/settings" element={
              <SettingsPage templates={templates} onTemplatesChange={setTemplates} />
            } />
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

      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.kind}`}>{toast.message}</div>
        ))}
      </div>
    </div>
  );
}
