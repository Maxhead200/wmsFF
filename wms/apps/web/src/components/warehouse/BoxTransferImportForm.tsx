import { CheckCircle2, FileSearch, RotateCcw, UploadCloud } from 'lucide-react';
import { ChangeEvent, useEffect, useRef, useState } from 'react';
import {
  commitBoxTransferImport,
  fetchClients,
  previewBoxTransferImport,
  type AuthSession,
  type BoxTransferImportCommitResult,
  type BoxTransferImportPreview,
  type ClientSummary,
} from '../../lib/api';

type BusyAction = 'preview' | 'commit' | null;

export function BoxTransferImportForm({ session }: { session: AuthSession }) {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientsError, setClientsError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sourceDocument, setSourceDocument] = useState('');
  const [preview, setPreview] = useState<BoxTransferImportPreview | null>(null);
  const [result, setResult] = useState<BoxTransferImportCommitResult | null>(null);
  const [error, setError] = useState('');
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadClients() {
      try {
        const list = await fetchClients(session.accessToken);
        if (!isActive) {
          return;
        }
        setClients(list);
        setSelectedClientId((current) => current || list[0]?.id || '');
      } catch (caught) {
        if (isActive) {
          setClientsError(caught instanceof Error ? caught.message : 'Не удалось загрузить клиентов.');
        }
      }
    }

    void loadClients();
    return () => {
      isActive = false;
    };
  }, [session.accessToken]);

  function changeFile(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    setPreview(null);
    setResult(null);
    setError('');
    if (nextFile && !sourceDocument) {
      setSourceDocument(nextFile.name);
    }
  }

  function clearImport() {
    setFile(null);
    setSourceDocument('');
    setPreview(null);
    setResult(null);
    setError('');
    setBusyAction(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function changeClient(clientId: string) {
    setSelectedClientId(clientId);
    setPreview(null);
    setResult(null);
    setError('');
  }

  async function runPreview() {
    if (!file || !selectedClientId) {
      return;
    }

    setBusyAction('preview');
    setError('');
    setResult(null);
    try {
      setPreview(await previewBoxTransferImport(session.accessToken, { file, clientId: selectedClientId }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось проверить файл перемещений.');
    } finally {
      setBusyAction(null);
    }
  }

  async function runCommit() {
    if (!file || !selectedClientId) {
      return;
    }

    setBusyAction('commit');
    setError('');
    try {
      setResult(
        await commitBoxTransferImport(session.accessToken, {
          file,
          clientId: selectedClientId,
          sourceDocument: sourceDocument.trim() || file.name,
        }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось записать перемещения.');
    } finally {
      setBusyAction(null);
    }
  }

  const hasErrors = Boolean(preview?.issues.some((issue) => issue.severity === 'error'));
  const isBusy = busyAction != null;
  const canSubmit = Boolean(file && selectedClientId && !isBusy);

  return (
    <section className="box-transfer-import">
      <div className="warehouse-subheading">
        <div>
          <h3>Перемещения из Excel</h3>
          <span>Внутренний инструмент склада: выберите клиента, проверьте шаблон и запишите перемещения.</span>
        </div>
      </div>

      <div className="warehouse-fields warehouse-fields--transfer-import">
        <label>
          <span>Клиент / юр. лицо</span>
          <select value={selectedClientId} onChange={(event) => changeClient(event.target.value)}>
            {clients.length === 0 ? <option value="">Клиенты не найдены</option> : null}
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.legalName || client.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Документ-источник</span>
          <input value={sourceDocument} onChange={(event) => setSourceDocument(event.target.value)} />
        </label>

        <label className="warehouse-file-field">
          <UploadCloud size={18} aria-hidden="true" />
          <span>{file?.name ?? 'Выберите XLSX-файл перемещений'}</span>
          <input ref={fileInputRef} accept=".xlsx,.xls" type="file" onChange={changeFile} />
        </label>
      </div>

      {clientsError ? <p className="form-error">{clientsError}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <div className="warehouse-actions">
        <button className="primary-button" type="button" onClick={runPreview} disabled={!canSubmit}>
          <FileSearch size={16} aria-hidden="true" />
          <span>{busyAction === 'preview' ? 'Проверка' : 'Проверить файл'}</span>
        </button>
        <button className="primary-button warehouse-secondary" type="button" onClick={runCommit} disabled={!canSubmit || hasErrors}>
          <CheckCircle2 size={16} aria-hidden="true" />
          <span>{busyAction === 'commit' ? 'Запись' : 'Записать перемещения'}</span>
        </button>
        <button
          className="primary-button warehouse-secondary"
          type="button"
          onClick={clearImport}
          disabled={isBusy || (!file && !preview && !result && !error)}
        >
          <RotateCcw size={16} aria-hidden="true" />
          <span>Очистить</span>
        </button>
      </div>

      {preview ? <BoxTransferPreview preview={preview} /> : null}
      {result ? <BoxTransferCommitResult result={result} /> : null}
    </section>
  );
}

function BoxTransferPreview({ preview }: { preview: BoxTransferImportPreview }) {
  return (
    <div className="transfer-import-result">
      <TransferImportMetrics
        metrics={[
          ['Строк', preview.summary.rows],
          ['Из коробов', preview.summary.sourceBoxes],
          ['В коробов', preview.summary.targetBoxes],
          ['Штрихкодов', preview.summary.barcodes],
          ['Штук', preview.summary.totalQuantity],
        ]}
      />
      <TransferImportIssues preview={preview} />
      <TransferImportSample preview={preview} />
    </div>
  );
}

function BoxTransferCommitResult({ result }: { result: BoxTransferImportCommitResult }) {
  return (
    <div className="transfer-import-result transfer-import-result--success">
      <div>
        <h3>Перемещения записаны</h3>
        <span>{result.sourceDocument}</span>
      </div>
      <TransferImportMetrics
        metrics={[
          ['Строк применено', result.result.rowsApplied],
          ['Движений', result.result.movementsCreated],
          ['Новых коробов', result.result.targetBoxesCreated],
          ['Штук', result.result.totalQuantity],
        ]}
      />
    </div>
  );
}

function TransferImportMetrics({ metrics }: { metrics: Array<[string, string | number]> }) {
  return (
    <div className="transfer-import-metrics">
      {metrics.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function TransferImportIssues({ preview }: { preview: BoxTransferImportPreview }) {
  if (preview.issues.length === 0) {
    return <p className="warehouse-inline">Ошибок нет, файл можно записать в WMS.</p>;
  }

  return (
    <div className="transfer-import-issues">
      {preview.issues.slice(0, 12).map((issue) => (
        <p className={issue.severity === 'error' ? 'issue issue--error' : 'issue'} key={`${issue.row}-${issue.message}`}>
          <span>Строка {issue.row}</span>
          {issue.message}
        </p>
      ))}
    </div>
  );
}

function TransferImportSample({ preview }: { preview: BoxTransferImportPreview }) {
  if (preview.sample.length === 0) {
    return null;
  }

  return (
    <div className="transfer-import-table-wrap">
      <table className="transfer-import-table">
        <thead>
          <tr>
            <th>Строка</th>
            <th>Откуда</th>
            <th>Баркод</th>
            <th>Куда</th>
            <th>Кол-во</th>
            <th>Товар</th>
            <th>Целевой короб</th>
          </tr>
        </thead>
        <tbody>
          {preview.sample.map((item) => (
            <tr key={`${item.sourceRow}-${item.fromBoxCode}-${item.barcode}-${item.toBoxCode}`}>
              <td>{item.sourceRow}</td>
              <td>{item.fromBoxCode}</td>
              <td>{item.barcode}</td>
              <td>{item.toBoxCode}</td>
              <td>{item.quantity}</td>
              <td>
                <strong>{item.internalSku || '-'}</strong>
                <span>{item.skuName || 'товар не найден'}</span>
              </td>
              <td>{item.targetBoxWillBeCreated ? 'будет создан' : 'есть в WMS'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
