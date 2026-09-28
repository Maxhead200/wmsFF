import { useEffect, useState, type FormEvent } from 'react';
import type { AuthSession } from '../../lib/api';
import { fetchOpenClawJob, submitOpenClawJob, OpenClawHttpError, type OpenClawJob } from '../../lib/openclaw-api';
type Pending = { requestId: string; conversationId: string; message: string };
function stored(key: string): Pending | null {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as Pending : null; } catch { return null; }
}
// FIX: a browser reload only reads the existing job; it never resubmits a server action.
export function OpenClawPanel({ session, allowed }: { session: AuthSession; allowed: boolean }) {
  const storageKey = `wms-openclaw:${session.user.id}`;
  const [pending, setPending] = useState<Pending | null>(() => stored(storageKey));
  const [job, setJob] = useState<OpenClawJob | null>(null);
  const [conversationId, setConversationId] = useState(() => stored(storageKey)?.conversationId ?? crypto.randomUUID());
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<Array<{ question: string; answer: string }>>([]);

  useEffect(() => {
    if (!pending || !allowed || (job && job.status !== 'RUNNING')) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const value = await fetchOpenClawJob(session.accessToken, pending.requestId);
        if (!stopped) { setJob(value); setError(''); }
        if (!stopped && value.status === 'RUNNING') timer = setTimeout(() => void poll(), 2000);
      } catch (caught) {
        if (!stopped) { setError(caught instanceof Error ? caught.message : 'Не удалось проверить задание.'); timer = setTimeout(() => void poll(), 5000); }
      }
    };
    timer = setTimeout(() => void poll(), 1000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [pending, allowed, job?.status, session.accessToken]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (pending || submitting || input.trim().length < 2) return;
    const value = { requestId: crypto.randomUUID(), conversationId, message: input.trim() };
    // Persist before POST. Failure to persist must stop the mutation request.
    try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch { setError('Не удалось сохранить идентификатор задания. Разрешите локальное хранение в браузере.'); return; }
    setPending(value); setJob(null); setError(''); setSubmitting(true); setInput('');
    try { setJob(await submitOpenClawJob(session.accessToken, value)); }
    catch (caught) {
      if (caught instanceof OpenClawHttpError && caught.status >= 400 && caught.status < 500) {
        setJob({ requestId: value.requestId, status: 'UNKNOWN', error: `Запрос отклонён: ${caught.message}` });
        setError('Повторного выполнения нет. Проверьте причину отказа перед следующим заданием.');
      } else setError(`${caught instanceof Error ? caught.message : 'Ошибка соединения'} Проверяем ранее отправленное задание; автоматического повторения нет.`);
    }
    finally { setSubmitting(false); }
  }
  function acknowledge() {
    if (!pending || job?.status === 'RUNNING' || !job) return;
    if (job.status === 'DONE') setHistory(current => [...current, { question: pending.message, answer: job.answer ?? '' }]);
    // UNKNOWN requires explicit operator reconciliation before clearing the blocker.
    localStorage.removeItem(storageKey); setPending(null); setJob(null); setError('');
  }
  if (!allowed) return <div className="wms-ai-panel">OpenClaw доступен владельцу и администраторам WMS.</div>;
  return <div className="wms-ai-panel">
    <header className="wms-ai-hero"><div><p className="eyebrow">OpenClaw · OpenAI API</p><h2>ИИ управления WMS</h2><p>Выполняет ваши задания на сервере. Запросы и результаты сохраняются в журнале.</p></div></header>
    <section className="wms-ai-chat" aria-label="Чат OpenClaw">
      <p>Содержание заданий и необходимые агенту данные передаются в OpenAI API.</p>
      {history.map((item, i) => <article key={i} className="wms-ai-message"><strong>{item.question}</strong><p className="wms-ai-answer">{item.answer}</p></article>)}
      {pending ? <article className="wms-ai-message" aria-live="polite"><strong>{pending.message}</strong><p>Задание: {pending.requestId}</p><p className="wms-ai-answer">{job?.answer ?? job?.error ?? 'OpenClaw выполняет задание…'}</p>
        {job && job.status !== 'RUNNING' ? <button type="button" onClick={acknowledge}>{job.status === 'UNKNOWN' ? 'Проверил журнал и фактические изменения' : 'Продолжить разговор'}</button> : null}
      </article> : null}
      {error ? <p className="wms-ai-error">{error}</p> : null}
      <form className="wms-ai-composer" onSubmit={event => void send(event)}><textarea value={input} onChange={event => setInput(event.target.value)} maxLength={4000} disabled={Boolean(pending) || submitting} rows={4} placeholder="Опишите, что проверить или изменить" /><button disabled={Boolean(pending) || submitting || input.trim().length < 2}>Отправить</button></form>
      <button type="button" disabled={Boolean(pending)} onClick={() => { setConversationId(crypto.randomUUID()); setHistory([]); }}>Новый разговор</button>
    </section>
  </div>;
}
