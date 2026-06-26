import { Boxes, Play, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  createPickWave,
  fetchClientRequests,
  fetchPickWaves,
  runPickWave,
  type AuthSession,
  type ClientRequestSummary,
  type PickWaveSummary,
} from '../../lib/api';
import { requestPriorityLabel, requestStatusLabel } from '../client-requests/clientRequestMeta';

type PickWavePanelProps = {
  session: AuthSession;
};

type LoadState<T> = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: T[];
  error?: string;
};

const eligibleStatuses = ['SUBMITTED', 'IN_REVIEW', 'APPROVED'];

export function PickWavePanel({ session }: PickWavePanelProps) {
  const [requests, setRequests] = useState<LoadState<ClientRequestSummary>>({ status: 'idle', data: [] });
  const [waves, setWaves] = useState<LoadState<PickWaveSummary>>({ status: 'idle', data: [] });
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  const eligibleRequests = useMemo(
    () => requests.data.filter((request) => request.type === 'OUTBOUND' && eligibleStatuses.includes(request.status)),
    [requests.data],
  );

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setMessage(null);
    setRequests((current) => ({ ...current, status: 'loading', error: undefined }));
    setWaves((current) => ({ ...current, status: 'loading', error: undefined }));
    try {
      const [nextRequests, nextWaves] = await Promise.all([
        fetchClientRequests(session.accessToken, { type: 'OUTBOUND' }),
        fetchPickWaves(session.accessToken),
      ]);
      setRequests({ status: 'ready', data: nextRequests });
      setWaves({ status: 'ready', data: nextWaves });
      setSelectedRequestIds((current) => current.filter((id) => nextRequests.some((request) => request.id === id)));
    } catch (caught) {
      const error = errorMessage(caught);
      setRequests((current) => ({ ...current, status: 'error', error }));
      setWaves((current) => ({ ...current, status: 'error', error }));
    }
  }

  async function submitWave() {
    if (selectedRequestIds.length === 0) {
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const wave = await createPickWave(session.accessToken, {
        requestIds: selectedRequestIds,
        comment: comment.trim() || undefined,
      });
      setWaves((current) => ({ status: 'ready', data: [wave, ...current.data] }));
      setSelectedRequestIds([]);
      setComment('');
      setMessage(`Волна ${wave.waveNumber} создана.`);
    } catch (caught) {
      setMessage(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  async function startWave(wave: PickWaveSummary) {
    setSubmitting(true);
    setMessage(null);
    try {
      const result = await runPickWave(session.accessToken, wave.id, {
        idempotencyKey: `web-wave:${wave.id}`,
        comment: `Сборка волны ${wave.waveNumber} из web-интерфейса.`,
      });
      setWaves((current) => ({
        status: 'ready',
        data: current.data.map((item) => (item.id === wave.id ? result.wave : item)),
      }));
      await loadData();
      setMessage(`Волна ${result.wave.waveNumber}: обработано ${result.results.length}.`);
    } catch (caught) {
      setMessage(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  function toggleRequest(requestId: string) {
    setSelectedRequestIds((current) =>
      current.includes(requestId) ? current.filter((id) => id !== requestId) : [...current, requestId],
    );
  }

  return (
    <section className="pick-wave-panel" aria-label="Волны сборки">
      <div className="warehouse-subheading">
        <div>
          <p className="eyebrow">Batch picking</p>
          <h3>Волны сборки</h3>
        </div>
        <button className="icon-button" type="button" onClick={() => void loadData()} title="Обновить волны" aria-label="Обновить волны">
          <RefreshCw size={17} aria-hidden="true" />
        </button>
      </div>

      {message ? <p className="warehouse-inline">{message}</p> : null}
      {requests.status === 'error' || waves.status === 'error' ? (
        <p className="form-error">{requests.error ?? waves.error}</p>
      ) : null}

      <div className="pick-wave-layout">
        <div className="pick-wave-candidates">
          <strong>Кандидаты</strong>
          {eligibleRequests.length ? (
            <div className="pick-wave-list">
              {eligibleRequests.slice(0, 12).map((request) => (
                <label key={request.id} className="pick-wave-request">
                  <input
                    type="checkbox"
                    checked={selectedRequestIds.includes(request.id)}
                    onChange={() => toggleRequest(request.id)}
                  />
                  <span>
                    <b>{request.title}</b>
                    <small>
                      {request.client.code} · {requestStatusLabel(request.status)} · {requestPriorityLabel(request.priority)} ·{' '}
                      {requestItemsQuantity(request)} шт.
                    </small>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="warehouse-inline">Нет outbound-заявок для новой волны.</p>
          )}
          <label className="warehouse-comment">
            <span>Комментарий</span>
            <input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Например: первая волна WB" />
          </label>
          <button
            className="primary-button"
            type="button"
            onClick={() => void submitWave()}
            disabled={selectedRequestIds.length === 0 || isSubmitting}
          >
            <Boxes size={16} aria-hidden="true" />
            <span>Создать волну</span>
          </button>
        </div>

        <div className="pick-wave-history">
          <strong>Последние волны</strong>
          {waves.data.length ? (
            <div className="pick-wave-list">
              {waves.data.slice(0, 8).map((wave) => (
                <article key={wave.id} className="pick-wave-card">
                  <div>
                    <b>{wave.waveNumber}</b>
                    <span className={`status status--${waveStatusTone(wave.status)}`}>{waveStatusLabel(wave.status)}</span>
                  </div>
                  <p>{wave.requests.length} заявок · {wavePickedCount(wave)} собрано · {waveFailedCount(wave)} ошибок</p>
                  {canRunWave(wave) ? (
                    <button className="review-action review-action--accept" type="button" onClick={() => void startWave(wave)} disabled={isSubmitting}>
                      <Play size={14} aria-hidden="true" />
                      <span>Запустить</span>
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="warehouse-inline">Волн сборки пока нет.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function requestItemsQuantity(request: ClientRequestSummary) {
  return request.items.reduce((sum, item) => sum + item.quantity, 0);
}

function wavePickedCount(wave: PickWaveSummary) {
  return wave.requests.filter((request) => request.status === 'PICKED').length;
}

function waveFailedCount(wave: PickWaveSummary) {
  return wave.requests.filter((request) => request.status === 'FAILED').length;
}

function canRunWave(wave: PickWaveSummary) {
  return wave.status === 'PLANNED' || wave.status === 'FAILED' || wave.status === 'PICKING';
}

function waveStatusLabel(status: PickWaveSummary['status']) {
  const labels: Record<PickWaveSummary['status'], string> = {
    PLANNED: 'план',
    PICKING: 'сборка',
    DONE: 'готово',
    FAILED: 'ошибка',
    CANCELLED: 'отмена',
  };
  return labels[status];
}

function waveStatusTone(status: PickWaveSummary['status']) {
  if (status === 'DONE') {
    return 'ready';
  }
  if (status === 'FAILED' || status === 'CANCELLED') {
    return 'planned';
  }
  return 'in-progress';
}

function errorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : 'Не удалось выполнить операцию с волной.';
}

