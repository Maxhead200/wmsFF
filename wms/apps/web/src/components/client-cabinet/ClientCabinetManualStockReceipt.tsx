import { PackagePlus } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { createManualStockReceipt, type ClientSummary, type ManualStockReceiptResult } from '../../lib/api';

type ClientCabinetManualStockReceiptProps = {
  accessToken: string;
  client: ClientSummary;
  onImported: () => Promise<void>;
};

export function ClientCabinetManualStockReceipt({ accessToken, client, onImported }: ClientCabinetManualStockReceiptProps) {
  const [barcode, setBarcode] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [boxCode, setBoxCode] = useState('');
  const [comment, setComment] = useState('');
  const [result, setResult] = useState<ManualStockReceiptResult | null>(null);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function submitManualReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setResult(null);

    const normalizedBarcode = barcode.trim();
    const normalizedQuantity = Number(quantity);

    if (!normalizedBarcode) {
      setError('Укажите штрихкод товара.');
      return;
    }

    if (!Number.isInteger(normalizedQuantity) || normalizedQuantity < 1) {
      setError('Количество должно быть целым числом больше нуля.');
      return;
    }

    setIsSaving(true);
    try {
      const created = await createManualStockReceipt(accessToken, {
        clientId: client.id,
        barcode: normalizedBarcode,
        quantity: normalizedQuantity,
        boxCode: boxCode.trim() || undefined,
        comment: comment.trim() || undefined,
      });
      setResult(created);
      setBarcode('');
      setQuantity('1');
      setComment('');
      await onImported();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось добавить остаток вручную.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="client-cabinet-stock-import" onSubmit={submitManualReceipt}>
      <div className="client-cabinet-stock-import__heading">
        <div>
          <h3>Ручное добавление</h3>
          <span>Клиент: {client.name}</span>
        </div>
      </div>
      <div className="client-cabinet-stock-import__fields">
        <label>
          <span>Штрихкод</span>
          <input value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder="Например 2049..." />
        </label>
        <label>
          <span>Количество</span>
          <input
            min="1"
            inputMode="numeric"
            type="number"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
        <label>
          <span>Короб</span>
          <input value={boxCode} onChange={(event) => setBoxCode(event.target.value)} placeholder="Можно оставить пустым" />
        </label>
        <label>
          <span>Комментарий</span>
          <input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Причина добавления" />
        </label>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      {result ? (
        <p className="form-success">
          Добавлено: {result.sku.name}, {result.quantity} шт. Короб: {result.box}
        </p>
      ) : null}
      <div className="client-cabinet-stock-import__actions">
        <button className="primary-button" type="submit" disabled={isSaving}>
          <PackagePlus size={16} aria-hidden="true" />
          <span>{isSaving ? 'Добавление' : 'Добавить остаток'}</span>
        </button>
      </div>
    </form>
  );
}
