import { afterEach, describe, expect, it, vi } from 'vitest';
import { productDisplayText, validProductDisplayFields } from '../src/modules/clients/product-display.policy';
import { ProductDisplayService } from '../src/modules/clients/product-display.service';
import { ProductDisplayInterceptor, isProductDisplayRoute } from '../src/modules/clients/product-display.interceptor';

// TEST: client isolation, unchanged data, and opt-in behavior for the sold WMS.
describe('client product display', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('only decorates assembly routes, never labels or spreadsheets', () => {
    for (const path of ['/api/v1/tsd/requests/a', '/tsd/requests/a/fbo', '/tsd/requests/a/fbo/actions', '/tsd/fbs/next?requestId=x', '/tsd/fbs/tasks/a/scan-kiz', '/tsd/fbs/cargo/a/scan-order', '/ozon-fbo/boxes/a/scan', '/marketplace-connections/fbs/web-order-assembly/scan']) expect(isProductDisplayRoute(path)).toBe(true);
    for (const path of ['/tsd/requests/a/fbo/wb-packages.xlsx', '/tsd/fbs/tasks/a/relabel/print', '/stock/balances', '/print/labels']) expect(isProductDisplayRoute(path)).toBe(false);
  });
  it('uses each SKU client preference and retains scan and quantity fields', async () => {
    const prisma = {
      sku: { findMany: vi.fn().mockResolvedValue([
        { id: 's1', clientId: 'one', name: 'Название', article: 'Корея', size: 'M', color: 'Синий', barcodes: [{ value: '00123' }] },
        { id: 's2', clientId: 'two', name: 'Другое', article: 'Два', size: 'L', color: 'Красный', barcodes: [] },
      ]) },
      systemSetting: { findMany: vi.fn().mockResolvedValue([{ key: 'client.product-display.v1:one', value: ['article', 'size'] }]) },
    };
    const response = { route: [{ tasks: [{ skuId: 's1', name: 'Прежнее', barcode: '00123', quantity: 3 }, { skuId: 's2', name: 'Другое', quantity: 1 }] }] };
    const result = await new ProductDisplayInterceptor(prisma as never).decorate(response);
    expect(response.route[0].tasks[0]).not.toHaveProperty('productDisplayText');
    expect(result).toEqual({ route: [{ tasks: [
      { skuId: 's1', name: 'Прежнее', barcode: '00123', quantity: 3, productDisplayText: 'Корея · M' },
      { skuId: 's2', name: 'Другое', quantity: 1 },
    ] }] });
  });
  it('accepts the five fields and rejects empty, duplicate and unknown fields', () => {
    expect(validProductDisplayFields(['name', 'article', 'barcode', 'size', 'color'])).toBe(true);
    for (const invalid of [[], ['name', 'name'], ['id'], undefined, 'article']) {
      expect(validProductDisplayFields(invalid)).toBe(false);
    }
  });
  it('only formats requested fields without mutating the product', () => {
    const sku = Object.freeze({ name: 'Костюм', article: 'Корея', barcode: '00123', size: 'M', color: 'Синий' });
    expect(productDisplayText(sku, ['article', 'size'])).toBe('Корея · M');
    expect(sku.name).toBe('Костюм');
    expect(productDisplayText(sku, ['barcode'])).toBe('00123');
  });
  it('does not read or write settings when disabled', async () => {
    vi.stubEnv('WMS_CLIENT_PRODUCT_DISPLAY_ENABLED', 'false');
    const prisma = { systemSetting: { upsert: vi.fn() }, client: { findFirst: vi.fn() } };
    const service = new ProductDisplayService(prisma as never, {} as never);
    await expect(service.save('c', ['article'], {} as never)).rejects.toThrow('не включена');
    expect(prisma.client.findFirst).not.toHaveBeenCalled();
    expect(prisma.systemSetting.upsert).not.toHaveBeenCalled();
  });
  it('keeps a separate key per client and verifies write access', async () => {
    vi.stubEnv('WMS_CLIENT_PRODUCT_DISPLAY_ENABLED', 'true');
    const upsert = vi.fn();
    const prisma = { client: { findFirst: vi.fn().mockResolvedValue({ id: 'c' }) }, systemSetting: { upsert } };
    const scopes = { requireClientAccess: vi.fn() };
    const service = new ProductDisplayService(prisma as never, scopes as never);
    const user = { id: 'u' } as never;
    await service.save('one', ['article'], user);
    await service.save('two', ['name', 'color'], user);
    expect(upsert.mock.calls.map(([arg]) => arg.where.key)).toEqual(['client.product-display.v1:one', 'client.product-display.v1:two']);
    expect(scopes.requireClientAccess).toHaveBeenCalledWith(user, 'one', 'write');
    scopes.requireClientAccess.mockImplementation(() => { throw new Error('forbidden'); });
    await expect(service.save('other', ['name'], user)).rejects.toThrow('forbidden');
    expect(upsert).toHaveBeenCalledTimes(2);
  });
  it('restores legacy display while keeping the settings author', async () => {
    vi.stubEnv('WMS_CLIENT_PRODUCT_DISPLAY_ENABLED', 'true');
    const upsert = vi.fn();
    const prisma = { client: { findFirst: vi.fn().mockResolvedValue({ id: 'one' }) }, systemSetting: { upsert, findUnique: vi.fn().mockResolvedValue({ value: { defaults: true } }) } };
    const service = new ProductDisplayService(prisma as never, { requireClientAccess: vi.fn() } as never);
    const user = { id: 'admin' } as never;
    await expect(service.save('one', null, user)).resolves.toEqual({ clientId: 'one', fields: null });
    expect(upsert.mock.calls[0][0].update).toEqual({ value: { defaults: true }, updatedByUserId: 'admin' });
    await expect(service.get('one', user)).resolves.toEqual({ clientId: 'one', fields: null });
  });
  it('decorates packing by exact request/order without changing label images', async () => {
    const prisma = {
      fbsTsdAssembly: { findMany: vi.fn().mockResolvedValue([{ requestId: 'r', orderId: '123', skuId: 's' }]) },
      sku: { findMany: vi.fn().mockResolvedValue([{ id: 's', clientId: 'c', name: 'Товар', barcodes: [{ value: '001' }] }]) },
      systemSetting: { findMany: vi.fn().mockResolvedValue([{ key: 'client.product-display.v1:c', value: ['barcode'] }]) },
    };
    const original = { requestId: 'r', orderId: '123', productName: 'Товар', imageBase64: 'original', sortingLabel: { imageBase64: 'sorting' } };
    const result = await new ProductDisplayInterceptor(prisma as never).decorate(original);
    expect(result).toEqual({ ...original, productDisplayText: '001' });
    expect(prisma.fbsTsdAssembly.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: [{ requestId: 'r', orderId: '123' }] } }));
    expect(original).not.toHaveProperty('productDisplayText');
  });
});
