import { afterEach, expect, it, vi } from 'vitest';
import { physicalKizIdentity, findPhysicalKizId } from '../src/common/kiz-physical-identity';
afterEach(() => vi.unstubAllEnvs());
const full = '0104680992598455215rYJoe1STv"l%\u001d91EE12\u001d92proof';
it('recognizes box 181 legacy code without separators without changing its serial case or full value', async () => {
  // TEST: the same scanned unit must not require registration as an unknown KIZ.
  expect(physicalKizIdentity(full)).toBe(physicalKizIdentity(full.replaceAll('\u001d', '')));
  expect(physicalKizIdentity(full.toLowerCase())).not.toBe(physicalKizIdentity(full));
  vi.stubEnv('WMS_KIZ_IDENTITY_TRANSFER_ENABLED', 'true');
  const db: any = { productMark: { findMany: vi.fn(async () => [{ id: 'legacy', value: full.replaceAll('\u001d', '') }]) } };
  await expect(findPhysicalKizId(db, full)).resolves.toBe('legacy');
});
it('refuses duplicate identities instead of choosing an arbitrary unit', async () => {
  // TEST: a legacy alias and full alias must be reviewed, even if one is blocked.
  vi.stubEnv('WMS_KIZ_IDENTITY_TRANSFER_ENABLED', 'true');
  const db: any = { productMark: { findMany: vi.fn(async () => [{ id: 'a', value: full }, { id: 'b', value: full.replaceAll('\u001d', '') }]) } };
  await expect(findPhysicalKizId(db, full)).rejects.toThrow('несколько');
});
it('keeps the sold VM on its existing lookup and rejects malformed suffixes', async () => {
  // TEST: opt-in isolation and no arbitrary truncation of longer serials.
  vi.stubEnv('WMS_KIZ_IDENTITY_TRANSFER_ENABLED', 'false');
  const db: any = { productMark: { findMany: vi.fn() } };
  await expect(findPhysicalKizId(db, full)).resolves.toBeUndefined();
  expect(db.productMark.findMany).not.toHaveBeenCalled();
  expect(physicalKizIdentity(full.slice(0, 31) + 'extra')).toBe('');
});

// TEST: feed labels already stored by WMS use a six-character serial and the same 91/92 tail.
const feed = '0104610460840533215rQSl4\u001d91EE12\u001d92P/bB4gja7P2f5eGm9g9HM6nCHagaCaJArfrxCiu2FFM=';
it('recognizes six-character feed serials with intact and omitted GS separators', () => {
  const identity = '0104610460840533215rQSl4';
  for (const code of [feed, feed.replaceAll('\u001d', ''), ']d2' + feed, feed.replaceAll('\u001d', '<GS>'), identity]) {
    expect(physicalKizIdentity(code)).toBe(identity);
  }
  expect(physicalKizIdentity(feed.toLowerCase())).not.toBe(identity);
  expect(feed).toContain('\u001d91EE12\u001d92');
});
it('finds the saved short identity and rejects duplicate aliases', async () => {
  vi.stubEnv('WMS_KIZ_IDENTITY_TRANSFER_ENABLED', 'true');
  const db: any = { productMark: { findMany: vi.fn(async () => [{ id: 'feed', value: feed }]) } };
  await expect(findPhysicalKizId(db, feed.replaceAll('\u001d', ''))).resolves.toBe('feed');
  db.productMark.findMany.mockResolvedValue([{ id: 'a', value: feed }, { id: 'b', value: ']d2' + feed }]);
  await expect(findPhysicalKizId(db, feed)).rejects.toThrow('несколько');
});
it('does not truncate arbitrary serials or accept unsupported short lengths', () => {
  for (const serial of ['abcde', 'abcdefg', 'abcdefgh', 'abcdefghijklmn']) {
    expect(physicalKizIdentity('010461046084053321' + serial)).toBe('');
    expect(physicalKizIdentity('010461046084053321' + serial + '\u001d91EE12\u001d92proof')).toBe('');
  }
  expect(physicalKizIdentity('010461046084053321abcdefBADTAILX')).toBe('');
});
it('keeps short-code legacy lookup unchanged with our-WMS feature disabled', async () => {
  vi.stubEnv('WMS_KIZ_IDENTITY_TRANSFER_ENABLED', 'false');
  const db: any = { productMark: { findMany: vi.fn() } };
  await expect(findPhysicalKizId(db, feed)).resolves.toBeUndefined();
  expect(db.productMark.findMany).not.toHaveBeenCalled();
});
