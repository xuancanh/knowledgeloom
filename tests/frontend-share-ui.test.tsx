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

await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

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
