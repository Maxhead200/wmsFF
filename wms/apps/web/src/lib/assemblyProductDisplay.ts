// FIX: server-provided presentation is separate from scanner/export product data.
export function assemblyProductLabel(value: object, fallback: string): string {
  const text = (value as { productDisplayText?: unknown }).productDisplayText;
  return typeof text === 'string' ? text : fallback;
}
export function hasAssemblyProductDisplay(value: object): boolean {
  return typeof (value as { productDisplayText?: unknown }).productDisplayText === 'string';
}
