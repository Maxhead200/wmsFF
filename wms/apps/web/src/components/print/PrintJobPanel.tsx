import { CheckCircle2, FileText, RefreshCw, Send, XCircle } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  createPrintJobFromTemplate,
  fetchLabelTemplates,
  fetchPrintJobs,
  fetchPrintPrinters,
  processPrintQueue,
  updatePrintJobStatus,
  type AuthSession,
  type LabelTemplateSummary,
  type PrintJobStatus,
  type PrintJobSummary,
  type PrintPrinterSummary,
} from '../../lib/api';
import { extractTemplateVariables, sampleVariableValue } from './templateVariables';

type PrintJobPanelProps = {
  session: AuthSession;
};

const printJobStatusLabels: Record<PrintJobStatus, string> = {
  queued: 'в очереди',
  sent: 'отправлено',
  printed: 'напечатано',
  failed: 'ошибка',
  cancelled: 'отменено',
};

const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function PrintJobPanel({ session }: PrintJobPanelProps) {
  const [templates, setTemplates] = useState<LabelTemplateSummary[]>([]);
  const [jobs, setJobs] = useState<PrintJobSummary[]>([]);
  const [printers, setPrinters] = useState<PrintPrinterSummary[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [printerCode, setPrinterCode] = useState('');
  const [copies, setCopies] = useState('1');
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setLoading] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );
  const selectedVariables = useMemo(
    () => extractTemplateVariables(selectedTemplate?.tspl ?? ''),
    [selectedTemplate?.tspl],
  );
  const selectedVariableKey = selectedVariables.join('|');

  useEffect(() => {
    void loadPrintData();
  }, [session.accessToken]);

  useEffect(() => {
    setVariableValues((current) => {
      const nextValues: Record<string, string> = {};
      selectedVariables.forEach((variable) => {
        nextValues[variable] = current[variable] ?? sampleVariableValue(variable);
      });
      return nextValues;
    });
  }, [selectedVariableKey]);

  async function loadPrintData() {
    setLoading(true);
    setError('');

    try {
      const [templateList, jobList, printerList] = await Promise.all([
        fetchLabelTemplates(session.accessToken),
        fetchPrintJobs(session.accessToken, { limit: '50' }),
        fetchPrintPrinters(session.accessToken),
      ]);
      setTemplates(templateList.filter((template) => template.isActive));
      setJobs(jobList);
      setPrinters(printerList);
      setSelectedTemplateId((current) => current || templateList.find((template) => template.isActive)?.id || '');
      setPrinterCode((current) => current || printerList.find((printer) => printer.isActive)?.code || 'TSC-01');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить очередь печати.');
    } finally {
      setLoading(false);
    }
  }

  async function enqueueJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTemplate) {
      return;
    }

    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      const job = await createPrintJobFromTemplate(session.accessToken, selectedTemplate.id, {
        printerCode: printerCode.trim(),
        variables: variableValues,
        copies: parseCopies(copies),
      });
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)].slice(0, 50));
      setMessage(`Задание ${job.id.slice(0, 8)} поставлено в очередь.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось поставить задание в очередь.');
    } finally {
      setSubmitting(false);
    }
  }

  async function changeJobStatus(job: PrintJobSummary, status: PrintJobStatus, messageText?: string) {
    setError('');
    setMessage('');

    try {
      const updated = await updatePrintJobStatus(session.accessToken, job.id, {
        status,
        message: messageText,
      });
      setJobs((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось обновить статус задания.');
    }
  }

  async function processQueueNow() {
    setError('');
    setMessage('');

    try {
      const result = await processPrintQueue(session.accessToken, { limit: 50 });
      setMessage(
        `Очередь обработана: ${result.processed}, напечатано ${result.printed}, отправлено ${result.sent}, ошибок ${result.failed}.`,
      );
      await loadPrintData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось обработать очередь печати.');
    }
  }

  const canSubmit = Boolean(selectedTemplate && printerCode.trim());

  return (
    <div className="print-job-layout">
      <form className="print-form print-job-create" onSubmit={enqueueJob}>
        <div className="print-template-header">
          <div>
            <h3>Поставить в очередь</h3>
            <span>Готовый TSPL сохранится в задании печати</span>
          </div>
          <Send size={18} aria-hidden="true" />
        </div>

        <div className="print-fields print-fields--job">
          <label>
            <span>Шаблон</span>
            <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} disabled={isLoading}>
              {templates.length === 0 ? <option value="">Активных шаблонов нет</option> : null}
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.code} - {template.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Принтер</span>
            <select value={printerCode} onChange={(event) => setPrinterCode(event.target.value)} required>
              {printers.length === 0 ? <option value="TSC-01">TSC-01</option> : null}
              {printers
                .filter((printer) => printer.isActive)
                .map((printer) => (
                  <option key={printer.id} value={printer.code}>
                    {printer.code} - {printer.name}
                  </option>
                ))}
            </select>
          </label>

          <label>
            <span>Копии</span>
            <input min="1" max="100" step="1" type="number" value={copies} onChange={(event) => setCopies(event.target.value)} />
          </label>
        </div>

        {selectedVariables.length > 0 ? (
          <div className="print-template-vars">
            {selectedVariables.map((variable) => (
              <label key={variable}>
                <span>{variable}</span>
                <input
                  value={variableValues[variable] ?? ''}
                  onChange={(event) =>
                    setVariableValues((current) => ({
                      ...current,
                      [variable]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
          </div>
        ) : (
          <p className="panel-message">Выберите шаблон, чтобы заполнить переменные задания.</p>
        )}

        {(error || message) ? <p className={error ? 'form-error' : 'inline-status'}>{error || message}</p> : null}

        <div className="print-actions">
          <button className="primary-button" type="submit" disabled={!canSubmit || isSubmitting}>
            <FileText size={16} aria-hidden="true" />
            <span>{isSubmitting ? 'Ставлю' : 'В очередь'}</span>
          </button>
          <button className="primary-button print-secondary" type="button" onClick={() => void loadPrintData()} disabled={isLoading}>
            <RefreshCw size={16} aria-hidden="true" />
            <span>Обновить</span>
          </button>
          <button className="primary-button print-secondary" type="button" onClick={() => void processQueueNow()} disabled={isLoading}>
            <Send size={16} aria-hidden="true" />
            <span>Обработать очередь</span>
          </button>
        </div>
      </form>

      <section className="print-job-list" aria-label="Последние задания печати">
        <div className="print-template-header">
          <div>
            <h3>Последние задания</h3>
            <span>{jobs.length} в списке</span>
          </div>
        </div>

        {jobs.length === 0 ? (
          <p className="panel-message">Заданий печати пока нет.</p>
        ) : (
          <div className="print-job-items">
            {jobs.map((job) => (
              <article className="print-job-card" key={job.id}>
                <div>
                  <span className={`status status--${statusTone(job.status)}`}>{printJobStatusLabels[job.status] ?? job.status}</span>
                  <strong>{payloadTemplateName(job)}</strong>
                  <small>
                    {job.printerCode} · {job.labelType} · {formatDate(job.createdAt)} · попыток {job.attempts}
                  </small>
                  {job.processedAt ? <small>Обработано: {formatDate(job.processedAt)}</small> : null}
                </div>
                <div className="print-job-actions">
                  <button
                    className="review-action review-action--accept"
                    type="button"
                    onClick={() => void changeJobStatus(job, 'printed')}
                    disabled={job.status === 'printed'}
                  >
                    <CheckCircle2 size={15} aria-hidden="true" />
                    <span>Готово</span>
                  </button>
                  <button
                    className="review-action review-action--reject"
                    type="button"
                    onClick={() => void changeJobStatus(job, 'failed', 'Оператор отметил ошибку печати.')}
                    disabled={job.status === 'failed'}
                  >
                    <XCircle size={15} aria-hidden="true" />
                    <span>Ошибка</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function parseCopies(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(Math.floor(parsed), 100) : 1;
}

function formatDate(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

function payloadTemplateName(job: PrintJobSummary) {
  const payload = job.payload ?? {};
  const code = typeof payload.templateCode === 'string' ? payload.templateCode : job.id.slice(0, 8);
  const name = typeof payload.templateName === 'string' ? payload.templateName : 'TSPL job';
  const copies = typeof payload.copies === 'number' ? payload.copies : 1;
  return `${code} - ${name} · ${copies} экз.`;
}

function statusTone(status: PrintJobStatus) {
  if (status === 'queued' || status === 'sent') {
    return 'in-progress';
  }

  if (status === 'printed') {
    return 'ready';
  }

  return 'planned';
}
