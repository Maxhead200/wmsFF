import { CalendarDays, CheckCircle2, FileSearch, UploadCloud } from 'lucide-react';
import { ChangeEvent, useState } from 'react';
import {
  commitLogisticsImport,
  previewLogisticsImport,
  type AuthSession,
  type LogisticsImportCommitResult,
  type LogisticsImportPreview,
} from '../../lib/api';
import { LogisticsCommitResultBlock, LogisticsPreviewResult } from './ImportResultBlocks';

type LogisticsImportFormProps = {
  session: AuthSession;
};

type BusyAction = 'preview' | 'commit' | null;

export function LogisticsImportForm({ session }: LogisticsImportFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [activeFrom, setActiveFrom] = useState('');
  const [activeTo, setActiveTo] = useState('');
  const [preview, setPreview] = useState<LogisticsImportPreview | null>(null);
  const [commitResult, setCommitResult] = useState<LogisticsImportCommitResult | null>(null);
  const [error, setError] = useState('');
  const [busyAction, setBusyAction] = useState<BusyAction>(null);

  function changeFile(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    setPreview(null);
    setCommitResult(null);
    setError('');

    if (nextFile && !name) {
      setName(nextFile.name.replace(/\.(xlsx|xls)$/i, ''));
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
      setPreview(await previewLogisticsImport(session.accessToken, { file }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось проверить тарифы.');
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
        await commitLogisticsImport(session.accessToken, {
          file,
          name: name.trim() || file.name,
          activeFrom: activeFrom || undefined,
          activeTo: activeTo || undefined,
        }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить тарифы.');
    } finally {
      setBusyAction(null);
    }
  }

  const isBusy = busyAction != null;
  const hasIssues = Boolean(preview?.issues.length);
  const canSubmit = Boolean(file && !isBusy);

  return (
    <div className="import-form">
      <div className="import-fields import-fields--logistics">
        <label>
          <span>Название набора</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>

        <label>
          <span>Активен с</span>
          <span className="date-input">
            <CalendarDays size={16} aria-hidden="true" />
            <input type="date" value={activeFrom} onChange={(event) => setActiveFrom(event.target.value)} />
          </span>
        </label>

        <label>
          <span>Активен до</span>
          <span className="date-input">
            <CalendarDays size={16} aria-hidden="true" />
            <input type="date" value={activeTo} onChange={(event) => setActiveTo(event.target.value)} />
          </span>
        </label>

        <label className="file-field">
          <UploadCloud size={18} aria-hidden="true" />
          <span>{file?.name ?? 'Выберите XLSX-файл тарифов'}</span>
          <input accept=".xlsx,.xls" type="file" onChange={changeFile} />
        </label>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="import-actions">
        <button className="primary-button" type="button" onClick={runPreview} disabled={!canSubmit}>
          <FileSearch size={16} aria-hidden="true" />
          <span>{busyAction === 'preview' ? 'Проверка' : 'Preview'}</span>
        </button>
        <button className="primary-button secondary-action" type="button" onClick={runCommit} disabled={!canSubmit || hasIssues}>
          <CheckCircle2 size={16} aria-hidden="true" />
          <span>{busyAction === 'commit' ? 'Загрузка' : 'Commit тарифов'}</span>
        </button>
      </div>

      {preview ? <LogisticsPreviewResult preview={preview} /> : null}
      {commitResult ? <LogisticsCommitResultBlock result={commitResult} /> : null}
    </div>
  );
}
