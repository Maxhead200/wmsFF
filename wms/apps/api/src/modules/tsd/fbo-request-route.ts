type RouteBox = { id: string; code: string; balances: Array<{ skuId: string; quantity: number; status: string }> };
type RouteRequest = { id: string; clientId: string; warehouseId: string | null };

// FIX: opt-in per request; a stale preference cannot follow a changed composition or warehouse.
export async function loadFboRoutePreference(
  db: { systemSetting: { findUnique(args: { where: { key: string } }): PromiseLike<{ value: unknown } | null> } },
  request: RouteRequest,
  compositionHash: string,
): Promise<Set<string> | null> {
  const setting = await db.systemSetting.findUnique({ where: { key: `fbo.route.${request.id}` } });
  const value = setting?.value as Record<string, unknown> | null | undefined;
  if (!value || value.version !== 1 || value.id !== request.id || value.clientId !== request.clientId
    || value.warehouseId !== request.warehouseId || value.compositionHash !== compositionHash
    || !Array.isArray(value.preferredBoxIds) || !value.preferredBoxIds.every(id => typeof id === 'string')) return null;
  return new Set(value.preferredBoxIds as string[]);
}

// FIX: order only authorized, non-busy candidates against current unpicked demand.
// The caller retains physical mark checks, local pallet context and all stock mutations.
export function orderFboRequestBoxes<T extends RouteBox>(
  boxes: T[], demand: Record<string, number>, decide: (box: T, remaining: Record<string, number>) => { allowed: boolean },
  preferred: ReadonlySet<string>,
): T[] {
  const remaining = { ...demand }, pending = [...boxes], result: T[] = [];
  const useful = (box: T) => {
    const available: Record<string, number> = {};
    for (const b of box.balances) if (b.status === 'AVAILABLE' && b.quantity > 0)
      available[b.skuId] = (available[b.skuId] ?? 0) + b.quantity;
    return Object.entries(available).reduce((sum, [sku, qty]) => sum + Math.min(qty, remaining[sku] ?? 0), 0);
  };
  const recent = (a: T, b: T) => Number(preferred.has(b.id)) - Number(preferred.has(a.id));
  const consume = (box: T) => {
    result.push(box); pending.splice(pending.indexOf(box), 1);
    for (const b of box.balances) if (b.status === 'AVAILABLE' && b.quantity > 0)
      remaining[b.skuId] = Math.max(0, (remaining[b.skuId] ?? 0) - b.quantity);
  };
  for (;;) {
    const whole = pending.filter(box => useful(box) > 0 && decide(box, remaining).allowed);
    if (!whole.length) break;
    whole.sort((a, b) => recent(a, b) || useful(b) - useful(a) || a.code.localeCompare(b.code));
    consume(whole[0]);
  }
  while (pending.length) {
    pending.sort((a, b) => useful(b) - useful(a) || recent(a, b) || a.code.localeCompare(b.code));
    if (useful(pending[0]) === 0) break;
    consume(pending[0]);
  }
  return [...result, ...pending];
}
// FIX: reuse a pure box decision only inside one route calculation.
export function cacheFboBoxDecision<B extends { balances: Array<{ skuId: string }> }, D>(
  decide: (box: B, remaining: Record<string, number>) => D,
): (box: B, remaining: Record<string, number>) => D {
  if (process.env.WMS_FBO_PLAN_COALESCE_ENABLED !== 'true') return decide;
  const cache = new WeakMap<B, { keys: string[]; values: Array<number | undefined>; result: D }>();
  return (box, remaining) => {
    const previous = cache.get(box);
    const keys = previous?.keys ?? [...new Set(box.balances.map(b => b.skuId))];
    if (previous && keys.every((key, i) => Object.is(remaining[key], previous.values[i]))) return previous.result;
    const result = decide(box, remaining);
    cache.set(box, { keys, values: keys.map(key => remaining[key]), result });
    return result;
  };
}
