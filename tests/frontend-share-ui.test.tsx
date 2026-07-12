import 'global-jsdom/register';
import * as React from 'react';
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../src/i18n/locales/en.json';
import { ShareDialog } from '../src/components/share/ShareDialog';
import SharePage from '../src/components/share/SharePage';

const storedValues = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storedValues.get(key) ?? null,
    setItem: (key: string, value: string) => storedValues.set(key, value),
    removeItem: (key: string) => storedValues.delete(key),
  },
});

await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

const SettingsPage = (await import('../src/components/settings/SettingsPage')).default;
const MarketplacePage = (await import('../src/components/marketplace/MarketplacePage')).default;

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

test('ShareDialog submits password and expiry options', async () => {
  const submitted: Array<{ password?: string; expiresInDays?: number }> = [];
  render(<ShareDialog onClose={() => {}} onCreate={async (options) => { submitted.push(options); }} />);

  fireEvent.change(screen.getByLabelText('Link expiry'), { target: { value: '30' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'long-enough-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create and copy link' }));

  await waitFor(() => assert.equal(submitted.length, 1));
  assert.deepEqual(submitted[0], { expiresInDays: 30, password: 'long-enough-password' });
});

test('ShareDialog rejects a short password before creating', async () => {
  let createCalls = 0;
  render(<ShareDialog onClose={() => {}} onCreate={async () => { createCalls += 1; }} />);
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create and copy link' }));
  assert.match((await screen.findByRole('alert')).textContent ?? '', /at least 8/);
  assert.equal(createCalls, 0);
});

test('SharePage prompts for and unlocks a protected link', async () => {
  const payload = {
    kind: 'note',
    note: { title: 'Shared Systems', category: 'Engineering', summary: '', tags: [], body: '# Reliable systems', createdAt: '2026-01-01' },
    flashcards: [],
    quiz: [],
    sharedAt: '2026-01-01',
  };
  globalThis.fetch = async (_input, init) => {
    if (!init?.method) {
      return new Response(JSON.stringify({ error: 'password required', passwordRequired: true }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  render(
    <MemoryRouter initialEntries={['/share/protected-id']}>
      <Routes><Route path="/share/:id" element={<SharePage />} /></Routes>
    </MemoryRouter>,
  );

  assert.ok(await screen.findByRole('heading', { name: 'This link is protected' }));
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
  assert.ok(await screen.findByRole('heading', { name: 'Shared Systems' }));
});

test('SettingsPage exposes backup controls and disables restore in read-only mode', () => {
  render(
    <SettingsPage templates={[]} onTemplatesChange={() => {}} userSettings={{}} readOnly />,
  );
  assert.ok(screen.getByRole('heading', { name: 'Backup and restore' }));
  assert.ok(screen.getByRole('button', { name: 'Export backup' }));
  assert.equal((screen.getByLabelText('Backup file') as HTMLInputElement).disabled, true);
  assert.equal((screen.getByRole('switch', { name: /Flashcards/ }) as HTMLButtonElement).disabled, true);
});

test('MarketplacePage confirms and submits a listing report', async () => {
  const requests: Array<{ url: string; method: string }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method || 'GET';
    requests.push({ url, method });
    if (url.includes('/report')) {
      return new Response(JSON.stringify({ reported: 'listing-1', reportCount: 1, unpublished: false }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({
      listings: [{
        id: 'listing-1', title: 'Shared Deck', description: '', kind: 'note', tags: [], author: '',
        imports: 0, publishedAt: '2026-01-01', avgStars: null, ratingCount: 0,
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  render(<MarketplacePage onOpenNote={() => {}} />);
  assert.ok(await screen.findByText('Shared Deck'));
  fireEvent.click(screen.getByRole('button', { name: 'Report' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm report' }));

  await screen.findByText('Reported “Shared Deck”.');
  assert.ok(requests.some((request) => request.method === 'POST' && request.url.endsWith('/api/marketplace/listing-1/report')));
});
