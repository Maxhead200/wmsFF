import { AlertTriangle, FileSpreadsheet, Upload } from 'lucide-react';
import { FormEvent, useState } from 'react';
import {
  importNomenclatureXlsx,
  type AuthSession,
  type NomenclatureImportResult,
} from '../../lib/api';
import { DirectoryResultCard } from './DirectoryResultCard';

type SkuImportFormProps = {
  session: AuthSession;
  onImported?: () => void;
};

export function SkuImportForm({ session, onImported }: SkuImportFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<NomenclatureImportResult | null>(null);
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
      const imported = await importNomenclatureXlsx(session.accessToken, { file });
      setResult(imported);
      setFile(null);
      onImported?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить номенклатуру.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="directory-form client-import-form" onSubmit={submit}>
      <div className="directory-subheading directory-subheading--plain">
        <div>
          <h3>Загрузка номенклатуры из Excel</h3>
          <span>Колонки: Наименование, Артикул, Наименование для печати, Штрихкод/Баркод при наличии</span>
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
          {isSubmitting ? 'Загружаем...' : 'Загрузить номенклатуру'}
        </button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {result ? (
        <>
          <DirectoryResultCard
            title="Номенклатура загружена"
            lines={[
              `Создано: ${result.summary.created}`,
              `Обновлено: ${result.summary.updated}`,
              `Пропущено: ${result.summary.skipped}`,
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
