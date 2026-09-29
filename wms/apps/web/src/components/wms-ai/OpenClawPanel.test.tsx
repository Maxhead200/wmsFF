import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { OpenClawPanel } from './OpenClawPanel';

const session = { accessToken: 'test-token', user: { id: 'owner' } } as never;

// TEST: the WMS screen exposes saved conversations and a new-chat action to allowed staff.
it('renders the shared history navigation and restricts denied users', () => {
  const allowed = renderToStaticMarkup(createElement(OpenClawPanel, { session, allowed: true }));
  expect(allowed).toContain('История запросов');
  expect(allowed).toContain('Новый разговор');
  expect(allowed).toContain('wms-openclaw-history');
  const denied = renderToStaticMarkup(createElement(OpenClawPanel, { session, allowed: false }));
  expect(denied).not.toContain('История запросов');
});
