import { ClipboardPaste, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  emptyClientRequestItem,
  MAX_CLIENT_REQUEST_ITEMS,
  parseClientRequestItemsText,
  type ClientRequestDraftItem,
} from './clientRequestItems';

type ClientRequestItemsEditorProps = {
  items: ClientRequestDraftItem[];
  onChange: (items: ClientRequestDraftItem[]) => void;
  onError: (message: string | null) => void;
};

export function ClientRequestItemsEditor({ items, onChange, onError }: ClientRequestItemsEditorProps) {
  const [pasteText, setPasteText] = useState('');

  function updateItem(index: number, field: keyof ClientRequestDraftItem, value: string) {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)));
  }

  function addItem() {
    if (items.length >= MAX_CLIENT_REQUEST_ITEMS) {
      onError(`В заявке может быть не больше ${MAX_CLIENT_REQUEST_ITEMS} позиций.`);
      return;
    }

    onError(null);
    onChange([...items, emptyClientRequestItem()]);
  }

  function removeItem(index: number) {
    onError(null);
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }

  function applyPaste() {
    try {
      const parsed = parseClientRequestItemsText(pasteText);
      const nextItems = [...items.filter((item) => item.name || item.barcode || item.comment), ...parsed].slice(
        0,
        MAX_CLIENT_REQUEST_ITEMS,
      );

      onError(null);
      onChange(nextItems.length > 0 ? nextItems : [emptyClientRequestItem()]);
      setPasteText('');
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : 'Не удалось разобрать состав заявки.');
    }
  }

  return (
    <section className="client-request-items-editor" aria-label="Состав заявки">
      <div className="client-request-items-editor__heading">
        <div>
          <h3>Состав заявки</h3>
          <p>{items.length} / {MAX_CLIENT_REQUEST_ITEMS} позиций</p>
        </div>
        <button className="secondary-action client-request-small-button" type="button" onClick={addItem}>
          <Plus size={15} aria-hidden="true" />
          <span>Строка</span>
        </button>
      </div>

      <div className="client-request-items-grid" role="table" aria-label="Позиции заявки">
        <div className="client-request-items-grid__header" role="row">
          <span>Штрихкод</span>
          <span>Товар</span>
          <span>Кол-во</span>
          <span>Комментарий</span>
          <span />
        </div>
        {items.map((item, index) => (
          <div className="client-request-items-grid__row" key={index} role="row">
            <input
              aria-label={`Штрихкод позиции ${index + 1}`}
              value={item.barcode}
              onChange={(event) => updateItem(index, 'barcode', event.target.value)}
            />
            <input
              aria-label={`Товар позиции ${index + 1}`}
              value={item.name}
              onChange={(event) => updateItem(index, 'name', event.target.value)}
            />
            <input
              aria-label={`Количество позиции ${index + 1}`}
              min="1"
              type="number"
              value={item.quantity}
              onChange={(event) => updateItem(index, 'quantity', event.target.value)}
            />
            <input
              aria-label={`Комментарий позиции ${index + 1}`}
              value={item.comment}
              onChange={(event) => updateItem(index, 'comment', event.target.value)}
            />
            <button
              className="icon-button client-request-row-remove"
              disabled={items.length === 1}
              type="button"
              onClick={() => removeItem(index)}
              title="Удалить строку"
              aria-label={`Удалить позицию ${index + 1}`}
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>

      <div className="client-request-paste">
        <label>
          <span>Вставка из Excel/CSV</span>
          <textarea
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            placeholder="штрихкод;товар;количество;комментарий"
          />
        </label>
        <button
          className="secondary-action client-request-small-button"
          disabled={!pasteText.trim()}
          type="button"
          onClick={applyPaste}
        >
          <ClipboardPaste size={15} aria-hidden="true" />
          <span>Добавить строки</span>
        </button>
      </div>
    </section>
  );
}
