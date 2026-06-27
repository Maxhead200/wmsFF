import { CheckCircle2, FileSearch, RotateCcw, UploadCloud } from 'lucide-react';
import { ChangeEvent, useRef, useState } from 'react';
import {
  commitReceiptImport,
  previewReceiptImport,
  type ClientSummary,
  type ReceiptImportCommitResult,
  type ReceiptImportPreview,
} from '../../lib/api';
import { formatCabinetNumber } from './clientCabinetFormat';

type ClientCabinetReceiptImportProps = {
  accessToken: string;
  client: ClientSummary;
  onImported: () => Promise<void>;
};

type BusyAction = 'preview' | 'commit' | null;

export function ClientCabinetReceiptImport({ accessToken, client, onImported }: ClientCabinetReceiptImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [sourceDocument, setSourceDocument] = useState('');
  const [preview, setPreview] = useState<ReceiptImportPreview | null>(null);
  const [commitResult, setCommitResult] = useState<ReceiptImportCommitResult | null>(null);
  const [error, setError] = useState('');
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function changeFile(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    setPreview(null);
    setCommitResult(null);
    setError('');
    if (nextFile && !sourceDocument) {
      setSourceDocument(nextFile.name);
    }
  }

  function clearImport() {
    setFile(null);
    setSourceDocument('');
    setPreview(null);
    setCommitResult(null);
    setError('');
    setBusyAction(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function runPreview() {
    if (!file) {
      return;
    }
    setBusyAction('preview');
    setError('');
    setCommitResult(null);
    try {
      setPreview(await previewReceiptImport(accessToken, { file, clientId: client.id }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось проверить файл приемки.');
    } finally {
      setBusyAction(null);
    }
  }

  async function runCommit() {
    if (!file) {
      return;
    }
    setBusyAction('commit');
    setError('');
    try {
      setCommitResult(
        await commitReceiptImport(accessToken, {
          file,
          clientId: client.id,
          sourceDocument: sourceDocument.trim() || file.name,
        }),
      );
      await onImported();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось записать приемку.');
    } finally {
      setBusyAction(null);
    }
  }

  const hasErrors = Boolean(preview?.issues.some((issue) => issue.severity === 'error'));
  const isBusy = busyAction != null;
  const canSubmit = Boolean(file && !isBusy);

  return (
    <div className="client-cabinet-stock-import client-cabinet-receipt-import">
      <div className="client-cabinet-stock-import__heading">
        <div>
          <h3>Приемка из Excel</h3>
          <span>Короб, баркод, КИЗ, артикул, цвет и размер будут записаны на клиента</span>
        </div>
      </div>
      <div className="client-cabinet-stock-import__fields">
        <label>
          <span>Документ-источник</span>
          <input value={sourceDocument} onChange={(event) => setSourceDocument(event.target.value)} />
        </label>
        <label className="client-cabinet-file-field">
          <UploadCloud size={18} aria-hidden="true" />
          <span>{file?.name ?? 'Выберите XLSX-файл приемки'}</span>
          <input ref={fileInputRef} accept=".xlsx,.xls" type="file" onChange={changeFile} />
        </label>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="client-cabinet-stock-import__actions">
        <button className="primary-button" type="button" onClick={runPreview} disabled={!canSubmit}>
          <FileSearch size={16} aria-hidden="true" />
          <span>{busyAction === 'preview' ? 'Проверка' : 'Проверить приемку'}</span>
        </button>
        <button className="primary-button secondary-action" type="button" onClick={runCommit} disabled={!canSubmit || hasErrors}>
          <CheckCircle2 size={16} aria-hidden="true" />
          <span>{busyAction === 'commit' ? 'Запись' : 'Записать приемку'}</span>
        </button>
        <button
          className="primary-button import-clear-action"
          type="button"
          onClick={clearImport}
          disabled={isBusy || (!file && !preview && !commitResult && !error)}
        >
          <RotateCcw size={16} aria-hidden="true" />
          <span>Отменить / очистить</span>
        </button>
      </div>

      {preview ? <ReceiptPreview preview={preview} /> : null}
      {commitResult ? <ReceiptCommitResult result={commitResult} /> : null}
    </div>
  );
}

function ReceiptPreview({ preview }: { preview: ReceiptImportPreview }) {
  return (
    <div className="client-cabinet-import-result">
      <strong>Проверка приемки</strong>
      <span>
        Коробов: {formatCabinetNumber(preview.summary.boxes)} · товаров: {formatCabinetNumber(preview.summary.rows)} · КИЗ:{' '}
        {formatCabinetNumber(preview.summary.kiz)}
      </span>
      {preview.issues.length > 0 ? (
        <div className="client-cabinet-import-issues">
          {preview.issues.slice(0, 10).map((issue) => (
            <span className={`client-cabinet-import-issue client-cabinet-import-issue--${issue.severity}`} key={`${issue.row}-${issue.message}`}>
              Строка {issue.row}: {issue.message}
            </span>
          ))}
          {preview.issues.length > 10 ? <small>Показаны первые 10 замечаний из {preview.issues.length}.</small> : null}
        </div>
      ) : (
        <small>Ошибок не найдено, можно записывать приемку.</small>
      )}
    </div>
  );
}

function ReceiptCommitResult({ result }: { result: ReceiptImportCommitResult }) {
  return (
    <div className="client-cabinet-import-result">
      <strong>Приемка записана</strong>
      <span>
        Движений: {formatCabinetNumber(result.result.movementsCreated)} · КИЗ: {formatCabinetNumber(result.result.kizCreated)} · коробов:{' '}
        {formatCabinetNumber(result.summary.boxes)}
      </span>
    </div>
  );
}
