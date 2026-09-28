import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { mergeMap } from 'rxjs/operators';
import { PrismaService } from '../../common/prisma/prisma.service';
import { productDisplayText, validProductDisplayFields } from './product-display.policy';

// FIX: annotate authorized assembly responses only. Raw fields, exports and labels remain intact.
export function isProductDisplayRoute(path: string) {
  const value = path.split('?')[0].replace(/^\/api\/v1/, '').replace(/\/+$/, '');
  return /^\/tsd\/requests\/[^/]+(?:\/fbo(?:\/actions)?)?$/.test(value) ||
    /^\/tsd\/fbs\/cargo(?:\/open|\/[^/]+\/(?:scan-order|undo-last|cancel|close))?$/.test(value) ||
    /^\/marketplace-connections\/fbs\/web-order-assembly\/(?:scan|history\/[^/]+\/reprint)$/.test(value) ||
    /^\/ozon-fbo\/(?:plans\/[^/]+|boxes\/[^/]+\/(?:scan|close))$/.test(value) ||
    /^\/tsd\/fbs\/(?:next|tasks\/[^/]+(?:\/(?:scan|scan-box|scan-barcode|scan-kiz|undo-kiz|complete|release|validate-stock-audit))?)$/.test(value);
}

type Row = Record<string, any>;
export function assemblyProductRows(root: unknown): Array<{ row: Row; id: string }> {
  const result: Array<{ row: Row; id: string }> = [];
  function visit(value: unknown, key = '') {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(item => visit(item, key)); return; }
    const row = value as Row;
    const id = row.skuId ?? (['product', 'sourceProduct', 'sku'].includes(key) ? row.id : null);
    if (typeof id === 'string') result.push({ row, id });
    else if ((typeof row.barcode === 'string' || typeof row.productBarcode === 'string' ||
      (typeof row.orderId === 'string' && typeof row.requestId === 'string')) &&
      (typeof row.productName === 'string' || typeof row.name === 'string')) result.push({ row, id: '' });
    Object.entries(row).forEach(([name, child]) => visit(child, name));
  }
  visit(root);
  return result;
}

@Injectable()
export class ProductDisplayInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ProductDisplayInterceptor.name);
  constructor(private readonly prisma: PrismaService) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();
    if (process.env.WMS_CLIENT_PRODUCT_DISPLAY_ENABLED !== 'true' || !isProductDisplayRoute(request.originalUrl ?? request.url ?? '')) return next.handle();
    return next.handle().pipe(mergeMap(async body => {
      try { return await this.decorate(body); }
      catch { this.logger.warn('Product display settings unavailable; retaining original assembly response.'); return body; }
    }));
  }
  async decorate(body: unknown) {
    // FIX: plans may be cached by the assembly service. Presentation must not contaminate the cache.
    body = structuredClone(body);
    const rows = assemblyProductRows(body);
    if (!rows.length) return body;
    const unboundOrders = rows.filter(item => !item.id && typeof item.row.orderId === 'string' && typeof item.row.requestId === 'string');
    if (unboundOrders.length) {
      const tasks = await this.prisma.fbsTsdAssembly.findMany({
        where: { OR: unboundOrders.map(({ row }) => ({ requestId: row.requestId, orderId: row.orderId })) },
        select: { requestId: true, orderId: true, skuId: true },
      });
      for (const item of unboundOrders) {
        const matching = tasks.filter(task => task.requestId === item.row.requestId && task.orderId === item.row.orderId);
        if (matching.length === 1) item.id = matching[0].skuId;
      }
    }
    const products = await this.prisma.sku.findMany({
      where: { id: { in: [...new Set(rows.map(item => item.id).filter(Boolean))] } },
      select: { id: true, clientId: true, name: true, article: true, size: true, color: true, barcodes: { select: { value: true }, orderBy: { value: 'asc' } } },
    });
    const settings = await this.prisma.systemSetting.findMany({ where: { key: { in: [...new Set(products.map(p => `client.product-display.v1:${p.clientId}`))] } } });
    const byId = new Map(products.map(p => [p.id, p]));
    const clientId = body && typeof body === 'object' ? (body as Row).client?.id : undefined;
    for (const { row, id } of rows) {
      const rowBarcode = row.productBarcode ?? row.barcode;
      const matches = !id && clientId ? products.filter(p => p.clientId === clientId && p.barcodes.some(b => b.value === rowBarcode)) : [];
      const product = byId.get(id) ?? (matches.length === 1 ? matches[0] : undefined);
      if (!product) continue;
      const fields = settings.find(s => s.key === `client.product-display.v1:${product.clientId}`)?.value;
      if (!validProductDisplayFields(fields)) continue;
      const barcode = typeof rowBarcode === 'string' && rowBarcode ? rowBarcode : product.barcodes.map(b => b.value).join(', ');
      row.productDisplayText = productDisplayText({ ...product, barcode }, fields) || 'Нет данных выбранных полей';
    }
    return body;
  }
}
