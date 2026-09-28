// FIX: presentation preferences never replace SKU identifiers or stored product data.
export const PRODUCT_DISPLAY_FIELDS = ['name', 'article', 'barcode', 'size', 'color'] as const;
export type ProductDisplayField = typeof PRODUCT_DISPLAY_FIELDS[number];

export function validProductDisplayFields(value: unknown): value is ProductDisplayField[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 5 &&
    new Set(value).size === value.length &&
    value.every(field => PRODUCT_DISPLAY_FIELDS.includes(field));
}

export function productDisplayText(
  product: Partial<Record<ProductDisplayField, string | null>>,
  fields: readonly ProductDisplayField[],
): string {
  return fields.map(field => product[field]?.trim()).filter(Boolean).join(' · ');
}
