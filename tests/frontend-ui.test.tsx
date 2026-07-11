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
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../src/i18n/locales/en.json';
import { MultiSelectDropdown } from '../src/components/MultiSelectDropdown';
import { FlashcardDone } from '../src/components/flashcards/FlashcardDone';

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
