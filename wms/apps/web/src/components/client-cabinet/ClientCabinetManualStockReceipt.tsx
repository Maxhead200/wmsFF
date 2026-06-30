import { PackagePlus } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  createManualStockReceipt,
  fetchSkus,
  type ClientSummary,
  type ManualStockReceiptResult,
  type SkuSummary,
} from '../../lib/api';

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
  const [suggestions, setSuggestions] = useState<SkuSummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSuggestionOpen, setSuggestionOpen] = useState(false);
  const [result, setResult] = useState<ManualStockReceiptResult | null>(null);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const suggestionBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const query = barcode.trim();

    if (query.length < 2) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    let isActive = true;
    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const rows = await fetchSkus(accessToken, { clientId: client.id, search: query });
        if (isActive) {
          setSuggestions(rows.slice(0, 8));
          setSuggestionOpen(true);
        }
      } catch {
        if (isActive) {
          setSuggestions([]);
        }
      } finally {
        if (isActive) {
          setIsSearching(false);
        }
      }
    }, 220);

    return () => {
      isActive = false;
      window.clearTimeout(timer);
    };
  }, [accessToken, barcode, client.id]);

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
      setSuggestions([]);
      setSuggestionOpen(false);
      await onImported();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось добавить остаток вручную.');
    } finally {
      setIsSaving(false);
    }
  }

  function selectSuggestion(sku: SkuSummary) {
    const nextBarcode = primaryBarcode(sku);
    if (!nextBarcode) {
      setError('У выбранной карточки нет штрихкода.');
      return;
    }

    setBarcode(nextBarcode);
    setSuggestionOpen(false);
    setSuggestions([]);
    setResult(null);
    setError('');
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
        <label className="client-cabinet-stock-import__autocomplete">
          <span>Штрихкод</span>
          <input
            value={barcode}
            onBlur={(event) => {
              if (!suggestionBoxRef.current?.contains(event.relatedTarget as Node | null)) {
                setSuggestionOpen(false);
              }
            }}
            onChange={(event) => {
              setBarcode(event.target.value);
              setResult(null);
              setError('');
            }}
            onFocus={() => setSuggestionOpen(suggestions.length > 0)}
            placeholder="ШК, название, артикул"
          />
          {isSuggestionOpen && (suggestions.length > 0 || isSearching) ? (
            <div className="client-cabinet-stock-suggestions" ref={suggestionBoxRef}>
              {isSearching ? <span className="client-cabinet-stock-suggestions__empty">Поиск...</span> : null}
              {suggestions.map((sku) => (
                <button key={sku.id} type="button" onClick={() => selectSuggestion(sku)}>
                  <strong>{sku.name}</strong>
                  <span>
                    {primaryBarcode(sku) || 'без ШК'} · {sku.article || sku.clientSku || sku.internalSku}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
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

function primaryBarcode(sku: SkuSummary) {
  return sku.barcodes.find((barcode) => barcode.isPrimary)?.value ?? sku.barcodes[0]?.value ?? '';
}
