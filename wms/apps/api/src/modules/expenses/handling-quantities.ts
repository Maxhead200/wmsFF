// FIX: keep physical quantities separate; convert only for final cost calculation.
export type HandlingQuantities = { palletCount: number; boxCount: number; bagCount: number; rollCount: number };
export const HANDLING_PALLET_RATE = 50000;
export function handlingQuantities(input: { pallets?: unknown; boxes?: unknown; bags?: unknown; rolls?: unknown }): HandlingQuantities {
  const read = (value: unknown, fractional: boolean) => {
    const text = value === undefined || value === '' ? '0' : String(value);
    if (!(fractional ? /^\d{1,5}(\.\d{1,4})?$/ : /^\d{1,6}$/).test(text)) throw new Error('Проверьте количество груза.');
    const n = Number(text); if (n > (fractional ? 10000 : 999999)) throw new Error('Количество груза слишком велико.');
    return n;
  };
  const q = { palletCount: read(input.pallets,true), boxCount: read(input.boxes,false), bagCount: read(input.bags,false), rollCount: read(input.rolls,false) };
  if (!Object.values(q).some(n => n > 0)) throw new Error('Укажите количество хотя бы в одной строке.');
  return q;
}
export function equivalentPallets(q: HandlingQuantities) {
  return q.palletCount + q.boxCount / 16 + q.bagCount / 5 + q.rollCount / 30;
}
