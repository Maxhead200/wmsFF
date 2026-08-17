import { RefreshCw, Save, Upload } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  createArticleMapping,
  fetchArticleMappings,
  fetchClients,
  importArticleMappingsXlsx,
  type ArticleMappingSummary,
  type AuthSession,
  type ClientSummary,
} from '../../lib/api';

type ArticleMappingPanelProps = {
  session: AuthSession;
};

const emptyForm = {
  sourceArticle: '',
  targetArticle: '',
  comment: '',
};

export function ArticleMappingPanel({ session }: ArticleMappingPanelProps) {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [clientId, setClientId] = useState('');
  const [mappings, setMappings] = useState<ArticleMappingSummary[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setLoading] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const selectedClient = useMemo(() => clients.find((client) => client.id === clientId) ?? null, [clientId, clients]);

  useEffect(() => {
    let isActive = true;

    async function loadClients() {
      try {
        const nextClients = await fetchClients(session.accessToken);
        if (!isActive) {
          return;
        }
        setClients(nextClients);
        setClientId((current) => (nextClients.some((client) => client.id === current) ? current : nextClients[0]?.id ?? ''));
      } catch (caught) {
        if (isActive) {
          setError(caught instanceof Error ? caught.message : 'Не удалось загрузить клиентов.');
        }
      }
    }

    void loadClients();

    return () => {
      isActive = false;
    };
  }, [session.accessToken]);

  useEffect(() => {
    if (!clientId) {
      setMappings([]);
      return;
    }

    void loadMappings(clientId);
  }, [clientId]);

  async function loadMappings(nextClientId = clientId) {
    if (!nextClientId) {
      return;
    }

    setLoading(true);
    setError('');
    try {
      const list = await fetchArticleMappings(session.accessToken, nextClientId);
      setMappings(list);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить соответствия.');
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clientId) {
      return;
    }

    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      await createArticleMapping(session.accessToken, {
        clientId,
        sourceArticle: form.sourceArticle,
        targetArticle: form.targetArticle,
        comment: form.comment || undefined,
      });
      setForm(emptyForm);
      setMessage('Соответствие сохранено.');
      await loadMappings(clientId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить соответствие.');
    } finally {
      setSubmitting(false);
    }
  }

  async function importFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clientId || !file) {
      return;
    }

    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const result = await importArticleMappingsXlsx(session.accessToken, { clientId, file });
      setFile(null);
      setMessage(`Импортировано: создано ${result.summary.created}, обновлено ${result.summary.updated}, ошибок ${result.summary.errors}.`);
      await loadMappings(clientId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось импортировать соответствия.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="directory-stack">
      <div className="directory-form">
        <div className="directory-subheading">
          <div>
            <h3>Соответствия артикулов</h3>
            <span>артикул на складе связывается с артикулом продавца для перемаркировки</span>
          </div>
          <button className="icon-text-button" type="button" onClick={() => void loadMappings()} disabled={isLoading || !clientId}>
            <RefreshCw size={15} aria-hidden="true" />
            <span>{isLoading ? 'Обновляю' : 'Обновить'}</span>
          </button>
        </div>

        <label className="directory-select-row">
          <span>Клиент</span>
          <select value={clientId} onChange={(event) => setClientId(event.target.value)}>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.code} - {client.name}
              </option>
            ))}
          </select>
        </label>

        <form className="directory-fields directory-fields--manager" onSubmit={submit}>
          <label>
            <span>Артикул на складе</span>
            <input value={form.sourceArticle} onChange={(event) => setForm({ ...form, sourceArticle: event.target.value })} required />
          </label>
          <label>
            <span>Артикул продавца</span>
            <input value={form.targetArticle} onChange={(event) => setForm({ ...form, targetArticle: event.target.value })} required />
          </label>
          <label>
            <span>Комментарий</span>
            <input value={form.comment} onChange={(event) => setForm({ ...form, comment: event.target.value })} />
          </label>
          <button className="primary-button directory-submit" type="submit" disabled={isSubmitting || !selectedClient}>
            <Save size={16} aria-hidden="true" />
            <span>Сохранить</span>
          </button>
        </form>

        <form className="directory-import-row" onSubmit={importFile}>
          <label className="directory-file-input">
            <Upload size={16} aria-hidden="true" />
            <span>{file ? file.name : 'Excel соответствий'}</span>
            <input accept=".xlsx,.xls" type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>
          <button className="directory-submit" disabled={isSubmitting || !file || !selectedClient} type="submit">
            Загрузить
          </button>
        </form>

        {error ? <p className="form-error">{error}</p> : null}
        {message ? <p className="form-success">{message}</p> : null}

        <div className="client-table-scroll">
          <table className="client-directory-table">
            <thead>
              <tr>
                <th>Артикул на складе</th>
                <th>Артикул продавца</th>
                <th>Комментарий</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((mapping) => (
                <tr key={mapping.id}>
                  <td>{mapping.sourceArticle}</td>
                  <td>{mapping.targetArticle}</td>
                  <td>{mapping.comment || '-'}</td>
                </tr>
              ))}
              {mappings.length === 0 ? (
                <tr>
                  <td colSpan={3}>{isLoading ? 'Загрузка...' : 'Соответствия не найдены'}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
