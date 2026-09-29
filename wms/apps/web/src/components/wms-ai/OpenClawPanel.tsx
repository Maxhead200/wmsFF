import { useEffect, useState, type FormEvent } from 'react';
import type { AuthSession } from '../../lib/api';
import { fetchOpenClawHistory, fetchOpenClawJob, submitOpenClawJob, OpenClawHttpError, openClawPollUncertain, type OpenClawHistoryItem, type OpenClawJob } from '../../lib/openclaw-api';
type Pending = { requestId: string; conversationId: string; message: string; submittedAt: number };
function stored(key: string): Pending | null {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as Pending : null; } catch { return null; }
}
// FIX: a browser reload only reads the existing job; it never resubmits a server action.
export function OpenClawPanel({ session, allowed }: { session: AuthSession; allowed: boolean }) {
  const storageKey = `wms-openclaw:${session.user.id}`;
  const [pending, setPending] = useState<Pending | null>(() => stored(storageKey));
  const [job, setJob] = useState<OpenClawJob | null>(null);
  const [conversationId, setConversationId] = useState(() => stored(storageKey)?.conversationId ?? '');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<OpenClawHistoryItem[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  // FIX: the WMS database reconstructs all operators' conversations after reload/login.
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    setHistoryLoading(true);
    fetchOpenClawHistory(session.accessToken).then(page => {
      if (!active) return;
      setHistory(page.items);
      setHistoryCursor(page.nextCursor);
      setConversationId(current => current || page.items[0]?.conversationId || '');
      setHistoryError('');
    }).catch(caught => { if (active) setHistoryError(caught instanceof Error ? caught.message : 'Не удалось загрузить историю.'); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [allowed, session.accessToken]);

  async function loadMore() {
    if (!historyCursor || historyLoading) return;
    setHistoryLoading(true);
    try {
      const page = await fetchOpenClawHistory(session.accessToken, historyCursor);
      setHistory(current => [...current, ...page.items.filter(item => !current.some(old => old.requestId === item.requestId))]);
      setHistoryCursor(page.nextCursor);
      setHistoryError('');
    } catch (caught) { setHistoryError(caught instanceof Error ? caught.message : 'Не удалось загрузить историю.'); }
    finally { setHistoryLoading(false); }
  }

  async function refreshHistory() {
    try {
      const page = await fetchOpenClawHistory(session.accessToken);
      setHistory(current => [...page.items, ...current.filter(old => !page.items.some(item => item.requestId === old.requestId))]);
      setHistoryCursor(current => current ?? page.nextCursor);
      setHistoryError('');
    } catch (caught) { setHistoryError(caught instanceof Error ? caught.message : 'Не удалось обновить историю.'); }
  }

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
        if (!stopped && openClawPollUncertain(caught, pending.submittedAt ?? 0)) {
          setJob({ requestId: pending.requestId, status: 'UNKNOWN', error: 'Не удалось получить результат задания. Проверьте журнал OpenClaw и фактические изменения. Автоматического повторения нет.' });
          return;
        }
        if (!stopped) { setError(caught instanceof Error ? caught.message : 'Не удалось проверить задание.'); timer = setTimeout(() => void poll(), 5000); }
      }
    };
    timer = setTimeout(() => void poll(), 1000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [pending, allowed, job?.status, session.accessToken]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const selectedOwner = history.find(item => item.conversationId === conversationId)?.userId;
    if (pending || submitting || input.trim().length < 2 || (selectedOwner && selectedOwner !== session.user.id)) return;
    const nextConversationId = conversationId || crypto.randomUUID();
    const value = { requestId: crypto.randomUUID(), conversationId: nextConversationId, message: input.trim(), submittedAt: Date.now() };
    setConversationId(nextConversationId);
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
    // UNKNOWN requires explicit operator reconciliation before clearing the blocker.
    try { localStorage.removeItem(storageKey); } catch { setError('Не удалось очистить сохранённое задание. Разрешите локальное хранение.'); return; }
    setPending(null); setJob(null); setError('');
    void refreshHistory();
  }
  if (!allowed) return <div className="wms-ai-panel">OpenClaw доступен владельцу и администраторам WMS.</div>;
  const conversations = [...new Map([...history].reverse().map(item => [item.conversationId, item])).values()].reverse();
  const selectedOwner = history.find(item => item.conversationId === conversationId)?.userId;
  const otherConversation = Boolean(selectedOwner && selectedOwner !== session.user.id);
  const messages = history.filter(item => item.conversationId === conversationId && item.requestId !== pending?.requestId).reverse();
  return <div className="wms-ai-panel">
    <header className="wms-ai-hero"><div><p className="eyebrow">OpenClaw · OpenAI API</p><h2>ИИ управления WMS</h2><p>Выполняет ваши задания на сервере. Запросы и результаты сохраняются в журнале.</p></div></header>
    <section className="wms-ai-chat wms-openclaw-layout" aria-label="Чат OpenClaw">
      <aside className="wms-openclaw-history" aria-label="История запросов WMS">
        <h3>История запросов</h3>
        <button type="button" disabled={Boolean(pending)} onClick={() => setConversationId(crypto.randomUUID())}>Новый разговор</button>
        {historyLoading && history.length === 0 ? <p>Загружаю историю…</p> : null}
        {historyError ? <p className="wms-ai-error">{historyError} <button type="button" onClick={() => void refreshHistory()}>Повторить</button></p> : null}
        {conversations.map(item => <button type="button" key={item.conversationId} disabled={Boolean(pending)}
          className={item.conversationId === conversationId ? 'is-active' : ''}
          onClick={() => setConversationId(item.conversationId)}>
          <strong>{item.message}</strong><small>{item.userName} · {new Date(item.createdAt).toLocaleString('ru-RU')}</small>
        </button>)}
        {historyCursor ? <button type="button" disabled={historyLoading} onClick={() => void loadMore()}>Показать ещё</button> : null}
      </aside>
      <div className="wms-openclaw-conversation">
      <p>Содержание заданий и необходимые агенту данные передаются в OpenAI API.</p>
      {messages.map(item => <article key={item.requestId} className="wms-ai-message">
        <small>{item.userName} · {new Date(item.createdAt).toLocaleString('ru-RU')}</small>
        <strong>{item.message}</strong><p className="wms-ai-answer">{item.answer ?? item.error ?? (item.status === 'RUNNING' ? 'OpenClaw выполняет задание…' : 'Результат неизвестен. Проверьте журнал и фактические изменения.')}</p>
      </article>)}
      {pending ? <article className="wms-ai-message" aria-live="polite"><strong>{pending.message}</strong><p>Задание: {pending.requestId}</p><p className="wms-ai-answer">{job?.answer ?? job?.error ?? 'OpenClaw выполняет задание…'}</p>
        {job && job.status !== 'RUNNING' ? <button type="button" onClick={acknowledge}>{job.status === 'UNKNOWN' ? 'Проверил журнал и фактические изменения' : 'Продолжить разговор'}</button> : null}
      </article> : null}
      {error ? <p className="wms-ai-error">{error}</p> : null}
      {otherConversation ? <p>Историю коллеги можно читать. Чтобы отправить своё задание, откройте новый разговор.</p> : null}
      <form className="wms-ai-composer" onSubmit={event => void send(event)}><textarea value={input} onChange={event => setInput(event.target.value)} maxLength={4000} disabled={Boolean(pending) || submitting || otherConversation} rows={4} placeholder="Опишите, что проверить или изменить" /><button disabled={Boolean(pending) || submitting || otherConversation || input.trim().length < 2}>Отправить</button></form>
      </div>
    </section>
  </div>;
}
