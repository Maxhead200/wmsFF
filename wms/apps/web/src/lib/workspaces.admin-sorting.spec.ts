import { afterEach, describe, expect, it, vi } from 'vitest';
import { canOpenWorkspace, type WorkspaceNavItem } from './workspaces';
import type { AuthUser } from './api';

const sorting = { id: 'pallet-sorting', permissions: ['stock:write'], audience: 'internal' } as WorkspaceNavItem;
afterEach(() => vi.unstubAllEnvs());
describe('administrative sorting menu', () => {
  it.each(['ADMIN', 'OWNER'])('does not expose physical stock overrides to demo %s', role => {
    // TEST: a demo ADMIN cannot reach the new unrestricted stock mutation path.
    vi.stubEnv('VITE_PALLET_SORTING_ENABLED', 'true');
    expect(canOpenWorkspace({ roleCodes: [role], permissionCodes: [], isDemo: true } as unknown as AuthUser, sorting)).toBe(false);
  });
  it.each(['ADMIN', 'OWNER'])('opens for %s without extra stock permissions or a stale visibility override', role => {
    // TEST: OWNER inherits ADMIN sorting access without requiring an extra role.
    vi.stubEnv('VITE_PALLET_SORTING_ENABLED', 'true');
    expect(canOpenWorkspace({ roleCodes: [role], permissionCodes: [], workspaceVisibility: { 'pallet-sorting': false } } as unknown as AuthUser, sorting)).toBe(true);
  });
  it.each(['MANAGER', 'CLIENT', 'OPERATOR'])('does not expose sorting to %s', role => {
    // TEST: system:admin does not replace the explicitly required ADMIN role.
    vi.stubEnv('VITE_PALLET_SORTING_ENABLED', 'true');
    expect(canOpenWorkspace({ roleCodes: [role], permissionCodes: ['system:admin'] } as AuthUser, sorting)).toBe(false);
  });
  it.each(['ADMIN', 'OWNER'])('keeps sorting disabled for %s without the installation flag', role => {
    // TEST: no change for sold installations.
    vi.stubEnv('VITE_PALLET_SORTING_ENABLED', 'false');
    expect(canOpenWorkspace({ roleCodes: [role], permissionCodes: ['system:admin'] } as AuthUser, sorting)).toBe(false);
  });
  it('keeps permissions and visibility checks for other workspaces', () => {
    // TEST: ADMIN is not a new global permission bypass.
    const stock = { ...sorting, id: 'warehouse' } as WorkspaceNavItem;
    expect(canOpenWorkspace({ roleCodes: ['ADMIN'], permissionCodes: [] } as unknown as AuthUser, stock)).toBe(false);
    expect(canOpenWorkspace({ roleCodes: ['ADMIN'], permissionCodes: ['stock:write'], workspaceVisibility: { warehouse: false } } as unknown as AuthUser, stock)).toBe(false);
  });
});
