import { Download, FileUp } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ClientRequestFileSummary, ClientRequestSummary } from '../../lib/api';
import { formatCabinetDate } from './clientCabinetFormat';

type ClientRequestFilesCellProps = {
  request: ClientRequestSummary;
  onUpload: (request: ClientRequestSummary, file: File) => Promise<void>;
  onDownload: (request: ClientRequestSummary, file: ClientRequestFileSummary) => Promise<void>;
};

export function ClientRequestFilesCell({ request, onUpload, onDownload }: ClientRequestFilesCellProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadSelected(file?: File) {
    if (!file) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await onUpload(request, file);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить файл.');
    } finally {
      setBusy(false);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  }

  async function downloadFile(file: ClientRequestFileSummary) {
    setBusy(true);
    setError(null);

    try {
      await onDownload(request, file);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось скачать файл.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="client-request-files-cell">
      <input
        ref={inputRef}
        type="file"
        onChange={(event) => void uploadSelected(event.currentTarget.files?.[0])}
        aria-label="Загрузить файл заявки"
      />
      <button
        className="document-open-button"
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        title="Приложить файл к заявке"
      >
        <FileUp size={15} aria-hidden="true" />
        <span>{busy ? 'Жду' : 'Файл'}</span>
      </button>

      {request.files.length > 0 ? (
        <div className="client-request-file-list">
          {request.files.map((file) => (
            <button
              className="client-request-file-link"
              key={file.id}
              type="button"
              disabled={busy}
              onClick={() => void downloadFile(file)}
              title={`${file.fileName} · ${formatFileSize(file.sizeBytes)}`}
            >
              <Download size={13} aria-hidden="true" />
              <span>{file.fileName}</span>
              <small>{formatCabinetDate(file.createdAt)}</small>
            </button>
          ))}
        </div>
      ) : (
        <span className="client-request-files-empty">нет файлов</span>
      )}

      {error ? <span className="client-request-file-error">{error}</span> : null}
    </div>
  );
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} Б`;
  }

  const sizeKb = sizeBytes / 1024;
  if (sizeKb < 1024) {
    return `${sizeKb.toFixed(1)} КБ`;
  }

  return `${(sizeKb / 1024).toFixed(1)} МБ`;
}
