import { AlertTriangle, CheckCircle2, FileSpreadsheet, Send, Upload } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import {
  commitOutboundRequestXlsx,
  previewOutboundRequestXlsx,
  type AuthSession,
  type ClientRequestPriority,
  type ClientRequestSummary,
  type ClientSummary,
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
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [preview, setPreview] = useState<OutboundRequestXlsxPreview | null>(null);
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
        desiredDate: desiredDate || undefined,
      });
      setPreview(nextPreview);
      setMessage(nextPreview.canCommit ? 'Файл готов к созданию заявки.' : 'Файл требует исправлений.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось проверить файл.');
    } finally {
      setPreviewing(false);
    }
  }

  async function createRequest() {
    if (!file) {
      setError('Выберите Excel-файл.');
      return;
    }

    setCommitting(true);
    setError(null);
    setMessage('');

    try {
      const result = await commitOutboundRequestXlsx(session.accessToken, {
        file,
        clientId,
        title: title || undefined,
        priority,
        desiredDate: desiredDate || undefined,
      });
      onCreated(result.request);
      setTitle('');
      setDesiredDate('');
      setFile(null);
      setPreview(null);
      setFileInputKey((current) => current + 1);
      setMessage(`Заявка ${result.request.title} создана.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось создать заявку из файла.');
    } finally {
      setCommitting(false);
    }
  }

  const issues = preview?.issues ?? [];
  const hasErrors = issues.some((issue) => issue.severity === 'error');

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
              setMessage('');
            }}
          />
        </label>
      </div>

      {preview ? (
        <div className="client-request-xlsx-preview">
          <div className="client-request-xlsx-summary">
            <span>{preview.summary.lines} SKU</span>
            <span>{preview.summary.totalQuantity} шт.</span>
            <span>{preview.summary.availableQuantity} доступно</span>
            <span>{preview.summary.shortageQuantity} дефицит</span>
          </div>

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
            {preview.lines.slice(0, 8).map((line) => (
              <div key={line.barcode} className="client-request-xlsx-line">
                <strong>{line.internalSku ?? line.barcode}</strong>
                <span>{line.name ?? line.barcode}</span>
                <small>
                  {line.requestedQuantity} / {line.availableQuantity}
                </small>
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
          disabled={isCommitting || !file || !preview || hasErrors}
          type="button"
          onClick={() => void createRequest()}
        >
          <Send size={16} aria-hidden="true" />
          <span>{isCommitting ? 'Создаю' : 'Создать заявку'}</span>
        </button>
      </div>
    </form>
  );
}
