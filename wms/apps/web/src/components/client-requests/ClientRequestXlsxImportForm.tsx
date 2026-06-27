import { AlertTriangle, CheckCircle2, FileSpreadsheet, Send, Trash2, Upload } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import {
  createClientRequest,
  previewOutboundRequestXlsx,
  type AuthSession,
  type ClientRequestPriority,
  type ClientRequestSummary,
  type ClientSummary,
  type OutboundRequestXlsxLine,
  type OutboundRequestXlsxPreview,
} from '../../lib/api';
import { requestPriorityOptions } from './clientRequestMeta';

type ClientRequestXlsxImportFormProps = {
  clients: ClientSummary[];
  session: AuthSession;
  onCreated: (request: ClientRequestSummary) => void;
};

export function ClientRequestXlsxImportForm({ clients, session, onCreated }: ClientRequestXlsxImportFormProps) {
  const writableClientIds = useMemo(() => {
    if (session.user.permissionCodes.includes('system:admin') || session.user.clientScopeMode === 'ALL') {
      return new Set(clients.map((client) => client.id));
    }

    return new Set(session.user.writableClientIds);
  }, [clients, session.user]);
  const writableClients = clients.filter((client) => writableClientIds.has(client.id));
  const [clientId, setClientId] = useState(writableClients[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<ClientRequestPriority>('NORMAL');
  const [desiredDate, setDesiredDate] = useState('');
  const [destinationCity, setDestinationCity] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [preview, setPreview] = useState<OutboundRequestXlsxPreview | null>(null);
  const [editableLines, setEditableLines] = useState<EditableXlsxLine[]>([]);
  const [confirmedRelabels, setConfirmedRelabels] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [isPreviewing, setPreviewing] = useState(false);
  const [isCommitting, setCommitting] = useState(false);

  if (writableClients.length === 0) {
    return null;
  }

  async function previewFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError('Выберите Excel-файл.');
      return;
    }

    setPreviewing(true);
    setError(null);
    setMessage('');

    try {
      const nextPreview = await previewOutboundRequestXlsx(session.accessToken, {
        file,
        clientId,
        title: title || undefined,
        priority,
        destinationCity,
        desiredDate: desiredDate || undefined,
      });
      setPreview(nextPreview);
      setEditableLines(
        nextPreview.lines.map((line, index) => ({
          ...line,
          needsRelabel: Boolean(line.needsRelabel),
          key: `${line.barcode ?? line.originalName ?? line.internalSku ?? index}-${index}`,
        })),
      );
      setConfirmedRelabels({});
      setMessage(nextPreview.canCommit ? 'Файл готов к созданию заявки.' : 'Файл требует исправлений.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось проверить файл.');
    } finally {
      setPreviewing(false);
    }
  }

  async function createRequest() {
    const validLines = editableLines.filter((line) => line.skuId && adjustedCanFulfill(line));
    if (!destinationCity.trim()) {
      setError('Укажите город поставки.');
      return;
    }

    if (!file || !preview || validLines.length === 0) {
      setError('Исправьте позиции перед созданием заявки.');
      return;
    }
    if (!relabelConfirmed) {
      setError('Подтвердите все позиции перемаркировки галочками.');
      return;
    }

    setCommitting(true);
    setError(null);
    setMessage('');

    try {
      const request = await createClientRequest(session.accessToken, {
        clientId,
        type: 'OUTBOUND',
        priority,
        title: title || preview.title,
        comment: `Создано из Excel: ${file.name}. Позиций: ${validLines.length}, количество: ${validLines.reduce((sum, line) => sum + line.requestedQuantity, 0)}.`,
        destinationCity,
        desiredDate: desiredDate || undefined,
        items: validLines.flatMap((line) => requestItemsFromLine(line)),
      });
      onCreated(request);
      setTitle('');
      setDesiredDate('');
      setDestinationCity('');
      setFile(null);
      setPreview(null);
      setEditableLines([]);
      setConfirmedRelabels({});
      setFileInputKey((current) => current + 1);
      setMessage(`Заявка ${request.title} создана.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось создать заявку из файла.');
    } finally {
      setCommitting(false);
    }
  }

  const issues = preview?.issues ?? [];
  const hasBlockingLines = editableLines.some((line) => !adjustedCanFulfill(line));
  const relabelLines = editableLines.filter((line) => hasRelabel(line));
  const relabelConfirmed = relabelLines.every((line) => confirmedRelabels[line.key]);
  const totalShipmentQuantity = editableLines.reduce((sum, line) => sum + line.requestedQuantity, 0);
  const estimatedBoxes = Math.ceil(totalShipmentQuantity / 15);
  const estimatedPallets = Math.ceil(estimatedBoxes / 16);

  return (
    <form className="client-request-xlsx-form" onSubmit={(event) => void previewFile(event)}>
      <div className="client-request-xlsx-form__header">
        <div>
          <h3>Сборка из Excel</h3>
          <span>штрихкод + количество</span>
        </div>
        <FileSpreadsheet size={20} aria-hidden="true" />
      </div>

      <div className="client-request-fields client-request-fields--xlsx">
        <label>
          <span>Клиент</span>
          <select value={clientId} onChange={(event) => setClientId(event.target.value)}>
            {writableClients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.code} · {client.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Приоритет</span>
          <select value={priority} onChange={(event) => setPriority(event.target.value as ClientRequestPriority)}>
            {requestPriorityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Желаемая дата</span>
          <input type="date" value={desiredDate} onChange={(event) => setDesiredDate(event.target.value)} />
        </label>
        <label>
          <span>Город поставки</span>
          <input required value={destinationCity} onChange={(event) => setDestinationCity(event.target.value)} />
        </label>
        <label className="client-request-fields__wide">
          <span>Название</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="client-request-fields__wide">
          <span>Файл Excel</span>
          <input
            key={fileInputKey}
            accept=".xlsx,.xls"
            type="file"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setPreview(null);
              setEditableLines([]);
              setMessage('');
            }}
          />
        </label>
      </div>

      {preview ? (
        <div className="client-request-xlsx-preview">
          <div className="client-request-xlsx-summary">
            <span>{editableLines.length} SKU</span>
            <span>{totalShipmentQuantity} шт. к отгрузке</span>
            <span>~{estimatedBoxes} кор. / ~{estimatedPallets} пал.</span>
            <span>{editableLines.reduce((sum, line) => sum + Math.min(line.availableQuantity, line.requestedQuantity), 0)} доступно</span>
            <span>{editableLines.reduce((sum, line) => sum + adjustedShortage(line), 0)} дефицит</span>
          </div>

          {relabelLines.length ? (
            <div className="client-request-relabel-confirm">
              {relabelLines.map((line) => (
                <label key={line.key} className="client-request-relabel-pill">
                  <input
                    checked={Boolean(confirmedRelabels[line.key])}
                    type="checkbox"
                    onChange={(event) => setConfirmedRelabels((current) => ({ ...current, [line.key]: event.target.checked }))}
                  />
                  <span>
                    Перемаркировка: {line.barcode} {'->'} {line.relabelTargetBarcode}, {line.relabelQuantity} шт.
                  </span>
                </label>
              ))}
            </div>
          ) : null}

          {issues.length ? (
            <div className="client-request-xlsx-issues">
              {issues.slice(0, 6).map((issue, index) => (
                <span
                  key={`${issue.row}-${issue.message}-${index}`}
                  className={`status status--${issue.severity === 'error' ? 'planned' : 'in-progress'}`}
                >
                  строка {issue.row}: {issue.message}
                </span>
              ))}
            </div>
          ) : null}

          <div className="client-request-xlsx-lines">
            {editableLines.map((line, index) => (
              <div key={line.key} className={`client-request-xlsx-line ${xlsxLineClassName(line)}`}>
                <strong>{xlsxLineLabel(line)}</strong>
                <span>{line.name ?? line.originalName ?? line.barcode}</span>
                <input
                  min="1"
                  type="number"
                  value={line.requestedQuantity}
                  onChange={(event) => updateEditableLine(index, Number(event.target.value))}
                  aria-label={`Количество ${xlsxLineLabel(line)}`}
                />
                <small>{xlsxLineText(line)}</small>
                <label className="client-request-xlsx-relabel">
                  <input
                    checked={line.needsRelabel}
                    type="checkbox"
                    onChange={(event) => updateEditableLineRelabel(index, event.target.checked)}
                  />
                  <span>Перемаркировать</span>
                </label>
                <button
                  className="icon-button client-request-row-remove"
                  type="button"
                  onClick={() => removeEditableLine(index)}
                  title="Удалить строку"
                  aria-label={`Удалить ${xlsxLineLabel(line)}`}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {(error || message) ? (
        <p className={error ? 'form-error' : 'inline-status'}>
          {error ? <AlertTriangle size={15} aria-hidden="true" /> : <CheckCircle2 size={15} aria-hidden="true" />}
          <span>{error || message}</span>
        </p>
      ) : null}

      <div className="client-request-xlsx-actions">
        <button className="primary-button client-request-secondary-button" disabled={isPreviewing || !file} type="submit">
          <Upload size={16} aria-hidden="true" />
          <span>{isPreviewing ? 'Проверяю' : 'Проверить файл'}</span>
        </button>
        <button
          className="primary-button"
          disabled={isCommitting || !destinationCity.trim() || !file || !preview || hasBlockingLines || !relabelConfirmed || editableLines.length === 0}
          type="button"
          onClick={() => void createRequest()}
        >
          <Send size={16} aria-hidden="true" />
          <span>{isCommitting ? 'Создаю' : 'Создать заявку'}</span>
        </button>
      </div>
    </form>
  );

  function updateEditableLine(index: number, quantity: number) {
    const normalized = Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;
    setEditableLines((current) =>
      current.map((line, lineIndex) => (lineIndex === index ? { ...line, requestedQuantity: normalized } : line)),
    );
  }

  function updateEditableLineRelabel(index: number, needsRelabel: boolean) {
    setEditableLines((current) =>
      current.map((line, lineIndex) => (lineIndex === index ? { ...line, needsRelabel } : line)),
    );
  }

  function removeEditableLine(index: number) {
    setEditableLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  }
}

type EditableXlsxLine = OutboundRequestXlsxLine & {
  key: string;
  needsRelabel: boolean;
};

function adjustedShortage(line: EditableXlsxLine) {
  return Math.max(0, line.requestedQuantity - line.availableQuantity);
}

function adjustedCanFulfill(line: EditableXlsxLine) {
  return Boolean(line.skuId) && adjustedShortage(line) === 0;
}

function xlsxLineClassName(line: EditableXlsxLine) {
  if (!adjustedCanFulfill(line)) {
    return 'client-request-xlsx-line--shortage';
  }

  return line.conflicts.length > 0 ? 'client-request-xlsx-line--reserved' : 'client-request-xlsx-line--ok';
}

function xlsxLineText(line: EditableXlsxLine) {
  const conflictText = line.conflicts.length
    ? ` Участвует в заявке: ${line.conflicts
        .slice(0, 2)
        .map((conflict) => `${conflict.title} от ${new Date(conflict.createdAt).toLocaleDateString('ru-RU')} (${conflict.type})`)
        .join('; ')}.`
    : '';
  const relabelText = hasRelabel(line) ? ` Перемаркировка: ${line.barcode} -> ${line.relabelTargetBarcode}, ${line.relabelQuantity} шт.` : '';

  if (!line.skuId) {
    return 'Товар не найден. Удалите строку или проверьте справочник SKU.';
  }

  if (!adjustedCanFulfill(line)) {
    return `Нужно ${line.requestedQuantity}, доступно ${line.availableQuantity}, занято ${line.reservedQuantity}.${relabelText}${conflictText}`;
  }

  return `Доступно ${line.availableQuantity}, занято ${line.reservedQuantity}.${relabelText}${conflictText}`;
}

function xlsxLineLabel(line: EditableXlsxLine) {
  return line.internalSku ?? line.originalName ?? line.barcode ?? line.name ?? 'товар';
}

function xlsxLineComment(line: EditableXlsxLine) {
  return [
    line.city ? `Город: ${line.city}` : null,
    line.artSeller ? `Артикул продавца: ${line.artSeller}` : null,
    line.size ? `Размер: ${line.size}` : null,
    line.relabelTargetBarcode && line.relabelQuantity ? `Перемаркировка из: ${line.barcode ?? ''}` : null,
    line.relabelTargetBarcode && line.relabelQuantity ? `Перемаркировка в: ${line.relabelTargetBarcode}` : null,
    line.relabelTargetBarcode && line.relabelQuantity ? `Количество перемаркировки: ${line.relabelQuantity}` : null,
    line.needsRelabel ? 'Перемаркировка: да' : null,
    `Excel rows: ${line.sourceRows.join(', ')}`,
  ]
    .filter(Boolean)
    .join('; ');
}

function hasRelabel(line: EditableXlsxLine) {
  return Boolean(line.relabelTargetBarcode && line.relabelQuantity && line.relabelQuantity > 0);
}

function requestItemsFromLine(line: EditableXlsxLine) {
  const relabelQuantity = hasRelabel(line) ? Math.min(line.relabelQuantity ?? 0, line.requestedQuantity) : 0;
  const normalQuantity = line.requestedQuantity - relabelQuantity;
  const base = {
    skuId: line.skuId ?? undefined,
    barcode: line.barcode ?? undefined,
    name: line.name ?? undefined,
  };
  const items = [];

  if (normalQuantity > 0) {
    items.push({
      ...base,
      quantity: normalQuantity,
      comment: xlsxLineComment({ ...line, relabelTargetBarcode: undefined, relabelQuantity: undefined }),
    });
  }

  if (relabelQuantity > 0) {
    items.push({
      ...base,
      quantity: relabelQuantity,
      comment: xlsxLineComment({ ...line, requestedQuantity: relabelQuantity, needsRelabel: true }),
    });
  }

  return items;
}
