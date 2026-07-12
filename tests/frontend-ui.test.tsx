/**
 * Rendered-component tests (jsdom + Testing Library).
 *
 * These exercise real DOM rendering and user interaction for self-contained,
 * props-driven components. Page-level surfaces that import the api client or the
 * router need a module-mock layer and are covered separately.
 *
 * Run: npm run test:ui
 */
import 'global-jsdom/register';
// The src components compile with the automatic JSX runtime (tsconfig.app.json),
// but this test file sits outside that project's include, so tsx compiles its
// own JSX with the classic runtime — React must be in scope here.
import * as React from 'react';
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../src/i18n/locales/en.json';
import { MultiSelectDropdown } from '../src/components/MultiSelectDropdown';
import { FlashcardDone } from '../src/components/flashcards/FlashcardDone';
import ActivityPage from '../src/components/activity/ActivityPage';
import { NoteTransferDialog } from '../src/components/notes/NoteTransferDialog';
import ImportPanel from '../src/components/import/ImportPanel';
import TodayPage from '../src/components/study/TodayPage';
import LearnPage from '../src/components/learn/LearnPage';
import GraphPage from '../src/components/graph/GraphPage';

await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

afterEach(() => cleanup());

const items = [
  { id: 'a', label: 'Algebra', count: 3 },
  { id: 'b', label: 'Biology', count: 5 },
];

test('MultiSelectDropdown: options are hidden until the trigger is clicked', () => {
  render(<MultiSelectDropdown label="Topics" items={items} selected={[]} onChange={() => {}} />);
  assert.equal(screen.queryByText('Algebra'), null);
  fireEvent.click(screen.getByRole('button', { name: /Topics/ }));
  assert.ok(screen.getByText('Algebra'));
  assert.ok(screen.getByText('Biology'));
});

test('MultiSelectDropdown: the trigger shows the selected count', () => {
  render(<MultiSelectDropdown label="Topics" items={items} selected={['a']} onChange={() => {}} />);
  assert.match(screen.getByRole('button').textContent ?? '', /Topics \(1\)/);
});

test('MultiSelectDropdown: toggling an item adds it to the selection', () => {
  const changes: string[][] = [];
  render(<MultiSelectDropdown label="Topics" items={items} selected={[]} onChange={(ids) => changes.push(ids)} />);
  fireEvent.click(screen.getByRole('button', { name: /Topics/ }));
  fireEvent.click(screen.getByText('Biology'));
  assert.deepEqual(changes.at(-1), ['b']);
});

test('MultiSelectDropdown: toggling a selected item removes it', () => {
  const changes: string[][] = [];
  render(<MultiSelectDropdown label="Topics" items={items} selected={['a', 'b']} onChange={(ids) => changes.push(ids)} />);
  fireEvent.click(screen.getByRole('button', { name: /Topics/ }));
  fireEvent.click(screen.getByText('Algebra'));
  assert.deepEqual(changes.at(-1), ['b']);
});

// ── FlashcardDone (study session summary) ────────────────────────────────────

const ratingCounts = { again: 2, hard: 1, good: 5 };

test('FlashcardDone: renders the per-rating breakdown counts', () => {
  render(
    <FlashcardDone
      filteredLength={8}
      scopeLabel="All"
      ratingCounts={ratingCounts}
      onRestart={() => {}}
      onExit={() => {}}
    />,
  );
  const cells = document.querySelectorAll('.fc-done-cell b');
  assert.deepEqual([...cells].map((c) => c.textContent), ['2', '1', '5']);
});

test('FlashcardDone: restart and exit buttons fire their callbacks', () => {
  let restarted = 0;
  let exited = 0;
  render(
    <FlashcardDone
      filteredLength={8}
      scopeLabel="All"
      ratingCounts={ratingCounts}
      onRestart={() => { restarted += 1; }}
      onExit={() => { exited += 1; }}
    />,
  );
  const buttons = screen.getAllByRole('button');
  fireEvent.click(buttons[0]); // review again
  fireEvent.click(buttons[1]); // back to collection
  assert.equal(restarted, 1);
  assert.equal(exited, 1);
});

test('ActivityPage: shows degraded search status without exposing raw errors', () => {
  render(
    <ActivityPage
      jobs={[]}
      searchStatus={{
        engine: 'meilisearch',
        state: 'degraded',
        lastAttemptAt: '2026-01-01T00:00:00.000Z',
        lastSuccessAt: null,
        error: 'secret infrastructure detail',
      }}
      onOpenNote={() => {}}
    />,
  );
  assert.ok(screen.getByText('Search index needs attention'));
  assert.match(screen.getByRole('status').textContent ?? '', /meilisearch/);
  assert.doesNotMatch(document.body.textContent ?? '', /secret infrastructure detail/);
});

test('NoteTransferDialog: chooses a destination and move mode', async () => {
  const transfers: Array<{ id: string; mode: string }> = [];
  render(
    <NoteTransferDialog
      currentSpaceId="default"
      onListSpaces={async () => [
        { id: 'default', name: 'Personal', builtin: true },
        { id: 'study', name: 'Study', builtin: false },
      ]}
      onClose={() => {}}
      onTransfer={async (id, mode) => { transfers.push({ id, mode }); }}
    />,
  );
  await screen.findByRole('option', { name: 'Study' });
  const moveButtons = screen.getAllByRole('button', { name: 'Move note' });
  fireEvent.click(moveButtons[0]);
  fireEvent.click(screen.getAllByRole('button', { name: 'Move note' }).at(-1)!);
  await waitFor(() => assert.deepEqual(transfers, [{ id: 'study', mode: 'move' }]));
});

test('ImportPanel: renders translated source controls', () => {
  render(<ImportPanel onOpenNote={() => {}} />);
  assert.ok(screen.getByText(/Drop a PDF/));
  assert.ok(screen.getByRole('button', { name: 'Import' }));
  assert.ok(screen.getByPlaceholderText(/paste source text/));
});

test('TodayPage: renders the translated empty queue and accessible exam controls', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes('/api/study/stats')) {
      return new Response(JSON.stringify({
        windowDays: 30,
        totals: { reviews: 0, flashcardReviews: 0, quizReviews: 0, successRate: null, retention1d: null, retention7d: null },
        categories: [],
        weakestTopics: [],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      flashcards: [],
      quiz: [],
      reminders: [],
      counts: { flashcards: 0, dueFlashcards: 0, newFlashcards: 0, quiz: 0, dueQuiz: 0, newQuiz: 0, reminders: 0 },
      generatedAt: new Date().toISOString(),
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    render(<TodayPage onOpenNote={() => {}} />);
    assert.ok(await screen.findByRole('heading', { name: 'Today' }));
    assert.ok(screen.getByText('Nothing due today.'));
    assert.ok(screen.getByRole('heading', { name: 'Exam mode' }));
    assert.ok(screen.getByLabelText('Exam date'));
    assert.ok(screen.getByLabelText('Exam category'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('LearnPage: opens a translated, accessible learning planner', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    xp: 0,
    todayXp: 0,
    dailyGoalXp: 100,
    streak: 0,
    mastery: {},
  }), { status: 200, headers: { 'content-type': 'application/json' } });

  try {
    render(<LearnPage notes={[]} categories={[]} onExit={() => {}} />);
    const planButton = await screen.findByRole('button', { name: /Plan a session/ });
    fireEvent.click(planButton);
    assert.ok(screen.getByRole('dialog', { name: /curriculum/ }));
    assert.ok(screen.getByText('Learning plan'));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    assert.equal(screen.queryByRole('dialog'), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GraphPage: keyboard selection opens an accessible note inspector', () => {
  const originalResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver;

  try {
    render(
      <MemoryRouter>
        <GraphPage
          state={{
            notes: [{
              id: 'note-1', fileName: 'note-1.md', path: 'Topic/note-1.md', title: 'Graph Theory',
              category: 'Topic', summary: 'Connected concepts.', tags: [], links: [], bilinks: [],
              createdAt: '2026-01-01T00:00:00.000Z',
            }],
            categories: [], graph: [],
          }}
          categories={[{
            id: 'Topic', name: 'Topic', slug: 'topic', count: 1, summaries: [],
            notes: [], color: 'moss', summary: '',
          }]}
          tagCounts={[]}
          onAddLink={async () => {}}
          onRemoveLink={async () => {}}
          onAddNote={async () => 'new-note'}
          onDeleteNote={async () => {}}
          onRenameNote={async () => {}}
          onSetCategory={async () => {}}
        />
      </MemoryRouter>,
    );
    assert.ok(screen.getByText('The Weave'));
    const node = screen.getByRole('button', { name: /Select Graph Theory/ });
    fireEvent.keyDown(node, { key: ' ' });
    assert.ok(screen.getByRole('button', { name: /^Open note/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    assert.equal(screen.queryByRole('button', { name: /^Open note/ }), null);
  } finally {
    globalThis.ResizeObserver = originalResizeObserver;
  }
});
