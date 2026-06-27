import { AlertTriangle, FileSpreadsheet, Upload } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { importClientsXlsx, type AuthSession, type ClientImportResult } from '../../lib/api';
import { DirectoryResultCard } from './DirectoryResultCard';

type ClientImportFormProps = {
  session: AuthSession;
};

export function ClientImportForm({ session }: ClientImportFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ClientImportResult | null>(null);
  const [error, setError] = useState('');
  const [isSubmitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError('Выберите Excel-файл.');
      return;
    }

    setSubmitting(true);
    setError('');
    setResult(null);
    try {
      setResult(await importClientsXlsx(session.accessToken, { file }));
      setFile(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить клиентов.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="directory-form client-import-form" onSubmit={submit}>
      <div className="directory-subheading directory-subheading--plain">
        <div>
          <h3>Загрузка клиентов из Excel</h3>
          <span>колонки: Наименование, Дата регистрации, Код</span>
        </div>
      </div>

      <div className="directory-import-row">
        <label className="directory-file-input">
          <FileSpreadsheet size={18} aria-hidden="true" />
          <span>{file ? file.name : 'Выбрать Excel-файл'}</span>
          <input
            accept=".xlsx,.xls"
            type="file"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setResult(null);
              setError('');
            }}
          />
        </label>
        <button className="directory-submit" disabled={isSubmitting || !file} type="submit">
          <Upload size={16} aria-hidden="true" />
          {isSubmitting ? 'Загружаем...' : 'Загрузить клиентов'}
        </button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {result ? (
        <>
          <DirectoryResultCard
            title="Файл обработан"
            lines={[
              `Создано клиентов: ${result.summary.created}`,
              `Пропущено строк: ${result.summary.skipped}`,
              `Ошибки: ${result.summary.errors}, предупреждения: ${result.summary.warnings}`,
            ]}
          />
          {result.issues.length > 0 ? (
            <div className="directory-issues">
              {result.issues.slice(0, 8).map((issue) => (
                <div className={`directory-issue directory-issue--${issue.severity}`} key={`${issue.row}-${issue.message}`}>
                  <AlertTriangle size={15} aria-hidden="true" />
                  <span>
                    Строка {issue.row}: {issue.message}
                  </span>
                </div>
              ))}
              {result.issues.length > 8 ? <span>Показаны первые 8 замечаний из {result.issues.length}.</span> : null}
            </div>
          ) : null}
        </>
      ) : null}
    </form>
  );
}
