import type { StockBalance } from '../../lib/api';

export const cabinetDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export const cabinetMoneyFormatter = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

export function formatCabinetDate(value: string | null) {
  if (!value) {
    return '-';
  }

  return cabinetDateFormatter.format(new Date(value));
}

export function formatCabinetMoney(value: string | number) {
  return cabinetMoneyFormatter.format(Number(value));
}

export function primaryBarcode(balance: StockBalance) {
  return balance.sku.barcodes.find((barcode) => barcode.isPrimary)?.value ?? balance.sku.barcodes[0]?.value ?? '-';
}

export function formatCabinetNumber(value: number) {
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
}
