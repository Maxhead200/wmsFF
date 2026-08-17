import type { SheetCell, SheetMatrix } from './stock-xlsx.parser';

export type LogisticsTier = {
  label: string;
  priceRub: number;
  minPallets?: number;
  maxPallets?: number;
  maxBoxes?: number;
  pricingMode: LogisticsPricingMode;
};

export type LogisticsPricingMode = 'TOTAL' | 'PER_PALLET' | 'MANUAL_REVIEW';

export type LogisticsDirection = {
  origin: string;
  destination: string;
  pricingMode: LogisticsPricingMode;
  tiers: LogisticsTier[];
};

export function parseLogisticsTariffSheet(rows: SheetMatrix) {
  const directions: LogisticsDirection[] = [];
  const issues: Array<{ row: number; message: string }> = [];
  let note = '';
  let origin = 'МОСКВА';
  let current: LogisticsDirection | null = null;

  rows.forEach((row, index) => {
    const sourceRow = index + 1;
    const label = text(row[0]);
    const priceText = text(row[1]);

    if (!label && !priceText) {
      return;
    }

    if (sourceRow === 1 && label) {
      note = label;
      return;
    }

    if (isTariffNote(label, priceText)) {
      note = note ? `${note}\n${label}` : label;
      return;
    }

    if (isOriginRow(label, priceText)) {
      origin = label;
      current = null;
      return;
    }

    if (isDestinationRow(label, priceText)) {
      current = {
        origin,
        destination: cleanDestination(label),
        pricingMode: directionPricingMode(label),
        tiers: [],
      };
      directions.push(current);
      return;
    }

    const priceRub = parsePrice(priceText);
    if (!current) {
      issues.push({ row: sourceRow, message: 'Строка тарифа без направления.' });
      return;
    }

    if (!priceRub) {
      issues.push({ row: sourceRow, message: 'Не удалось распознать цену тарифа.' });
      return;
    }

    current.tiers.push({
      label,
      priceRub,
      pricingMode: tierPricingMode(label, current.pricingMode),
      ...parseTierLabel(label),
    });
  });

  return { note, directions, issues };
}

function isOriginRow(label: string, priceText: string) {
  return Boolean(label && !priceText && label.toUpperCase() === label && label.length < 40);
}

function isTariffNote(label: string, priceText: string) {
  const lower = label.toLowerCase();
  return Boolean(label && !priceText && (lower.includes('поставки') || lower.includes('утверждаются')));
}

function isDestinationRow(label: string, priceText: string) {
  const lower = label.toLowerCase();
  if (!label || isTariffNote(label, priceText)) {
    return false;
  }

  return Boolean(priceText.toLowerCase() === 'цена' || lower.includes('цена за паллет') || (!priceText && label.length <= 70));
}

function parseTierLabel(label: string) {
  const lower = label.toLowerCase();

  if (lower.includes('шт')) {
    const match = lower.match(/до\s+(\d+)/);
    return match ? { maxBoxes: Number(match[1]) } : {};
  }

  const range = lower.match(/(?:от\s*)?(\d+)\s*(?:-|до)\s*(\d+)/);
  if (range) {
    return { minPallets: Number(range[1]), maxPallets: Number(range[2]) };
  }

  const single = lower.match(/(\d+)\s*пал/);
  if (!single) {
    return {};
  }

  const value = Number(single[1]);
  return lower.includes('от') ? { minPallets: value } : { minPallets: value, maxPallets: value };
}

function cleanDestination(label: string) {
  return label.replace(/\(цена за паллет\)/gi, '').trim();
}

function directionPricingMode(label: string): LogisticsPricingMode {
  return label.toLowerCase().includes('цена за паллет') ? 'PER_PALLET' : 'MANUAL_REVIEW';
}

function tierPricingMode(label: string, parentMode: LogisticsPricingMode): LogisticsPricingMode {
  // Русский комментарий: коробочные строки считаем полной стоимостью, а паллетные строки наследуют режим из заголовка направления.
  return label.toLowerCase().includes('шт') ? 'TOTAL' : parentMode;
}

function parsePrice(value: string) {
  const cleaned = value.replace(/[₽\s]/g, '');
  const normalized = cleaned.includes(',') && cleaned.includes('.') ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: SheetCell) {
  return value == null ? '' : String(value).trim();
}
