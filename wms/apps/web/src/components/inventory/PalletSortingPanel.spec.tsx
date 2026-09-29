import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { PalletSortingPanel } from './PalletSortingPanel';
import { canOpenWorkspace, workspaceNav } from '../../lib/workspaces';

afterEach(() => vi.unstubAllEnvs());
it('provides sorting to both ADMIN and OWNER', () => {
  // TEST: the owner inherits administrator access to the same sorting entry.
  vi.stubEnv('VITE_PALLET_SORTING_ENABLED', 'true');
  const item = workspaceNav.find(w => w.id === 'pallet-sorting');
  expect(item).toBeDefined();
  const user: any = { roleCodes: ['OWNER'], permissionCodes: ['system:admin'] };
  expect(canOpenWorkspace(user, item!)).toBe(true);
  expect(canOpenWorkspace({ ...user, roleCodes: ['ADMIN'] }, item!)).toBe(true);
});
it.each(['ADMIN', 'OWNER'])('renders the source scan prompt for %s and refuses collectors', role => {
  // TEST: direct rendering does not expose administrative controls to a collector.
  const session: any = { accessToken: 'test', user: { id: 'admin', roleCodes: [role], activeWarehouseId: 'wh' } };
  expect(renderToStaticMarkup(<PalletSortingPanel session={session} />)).toContain('Паллет-сорт или короб');
  expect(renderToStaticMarkup(<PalletSortingPanel session={{ ...session, user: { roleCodes: ['OPERATOR'] } }} />)).not.toContain('Начать сортировку');
});
