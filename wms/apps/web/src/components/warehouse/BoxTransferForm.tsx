import { RefreshCw, SendHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  fetchBoxes,
  fetchClients,
  fetchStockBalances,
  transferBetweenBoxes,
  type AuthSession,
  type ClientSummary,
  type StockBalance,
  type TransferBetweenBoxesResult,
  type WarehouseBoxSummary,
} from '../../lib/api';
import { TransferPreview, TransferResult } from './TransferStatusBlocks';

type BoxTransferFormProps = {
  session: AuthSession;
};

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export function BoxTransferForm({ session }: BoxTransferFormProps) {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [boxes, setBoxes] = useState<WarehouseBoxSummary[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedBalanceId, setSelectedBalanceId] = useState('');
  const [toBoxCode, setToBoxCode] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [comment, setComment] = useState('');
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<TransferBetweenBoxesResult | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  const selectedBalance = useMemo(
    () => balances.find((balance) => balance.id === selectedBalanceId) ?? null,
    [balances, selectedBalanceId],
  );
  const sourceBalances = balances.filter((balance) => balance.box?.code && balance.quantity > 0);

  useEffect(() => {
    void loadClients();
  }, [session.accessToken]);

  useEffect(() => {
    if (selectedClientId) {
      void loadOperationalData(selectedClientId);
    }
  }, [selectedClientId]);

  async function loadClients() {
    setLoadState('loading');
    setError('');

    try {
      const list = await fetchClients(session.accessToken);
      setClients(list);
      setSelectedClientId((current) => current || list[0]?.id || '');
      if (list.length === 0) {
        setLoadState('ready');
      }
    } catch (caught) {
      setLoadState('error');
      setError(errorMessage(caught));
    }
  }

  async function loadOperationalData(clientId = selectedClientId) {
    if (!clientId) {
      return;
    }

    setLoadState('loading');
    setError('');
    setResult(null);

    try {
      const [nextBalances, nextBoxes] = await Promise.all([
        fetchStockBalances(session.accessToken, { clientId }),
        fetchBoxes(session.accessToken, { clientId }),
      ]);
      setBalances(nextBalances);
      setBoxes(nextBoxes);
      setSelectedBalanceId((current) => keepSelectedBalance(current, nextBalances));
      setLoadState('ready');
    } catch (caught) {
      setLoadState('error');
      setError(errorMessage(caught));
    }
  }

  function changeClient(clientId: string) {
    setSelectedClientId(clientId);
    setSelectedBalanceId('');
    setToBoxCode('');
    setQuantity('1');
    setComment('');
    setResult(null);
  }

  function changeBalance(balanceId: string) {
    const balance = balances.find((item) => item.id === balanceId);
    setSelectedBalanceId(balanceId);
    setQuantity(balance ? String(Math.min(balance.quantity, Number(quantity) || 1)) : '1');
    setResult(null);
  }

  async function submitTransfer() {
    if (!selectedBalance?.box?.code || !selectedClientId) {
      return;
    }

    setSubmitting(true);
    setError('');
    setResult(null);

    try {
      const parsedQuantity = Number(quantity);
      const transfer = await transferBetweenBoxes(session.accessToken, {
        clientId: selectedClientId,
        skuId: selectedBalance.skuId,
        fromBoxCode: selectedBalance.box.code,
        toBoxCode: toBoxCode.trim(),
        quantity: parsedQuantity,
        status: selectedBalance.status,
        idempotencyKey: buildIdempotencyKey(selectedBalance.id),
        comment: comment.trim() || undefined,
      });
      setResult(transfer);
      await loadOperationalData(selectedClientId);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  const parsedQuantity = Number(quantity);
  const hasValidQuantity =
    Number.isInteger(parsedQuantity) && parsedQuantity > 0 && (!selectedBalance || parsedQuantity <= selectedBalance.quantity);
  const canSubmit =
    Boolean(selectedBalance?.box?.code && toBoxCode.trim()) && hasValidQuantity && loadState !== 'loading' && !isSubmitting;

  return (
    <div className="box-transfer">
      <div className="warehouse-fields">
        <label>
          <span>Клиент</span>
          <select value={selectedClientId} onChange={(event) => changeClient(event.target.value)}>
            {clients.length === 0 ? <option value="">Клиенты не найдены</option> : null}
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.code} - {client.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Исходный остаток</span>
          <select value={selectedBalanceId} onChange={(event) => changeBalance(event.target.value)}>
            {sourceBalances.length === 0 ? <option value="">Остатков в коробах нет</option> : null}
            {sourceBalances.map((balance) => (
              <option key={balance.id} value={balance.id}>
                {balance.box?.code} - {balance.sku.internalSku} - {balance.quantity} шт.
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Целевой короб</span>
          <input
            list="warehouse-boxes"
            placeholder="Например BOX-002"
            value={toBoxCode}
            onChange={(event) => setToBoxCode(event.target.value)}
          />
          <datalist id="warehouse-boxes">
            {boxes.map((box) => (
              <option key={box.id} value={box.code} />
            ))}
          </datalist>
        </label>

        <label>
          <span>Количество</span>
          <input
            min="1"
            max={selectedBalance?.quantity ?? undefined}
            type="number"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
      </div>

      <label className="warehouse-comment">
        <span>Комментарий</span>
        <input value={comment} onChange={(event) => setComment(event.target.value)} />
      </label>

      {selectedBalance ? <TransferPreview balance={selectedBalance} toBoxCode={toBoxCode} /> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {loadState === 'loading' ? <p className="warehouse-inline">Обновляю складские данные.</p> : null}

      <div className="warehouse-actions">
        <button className="primary-button" type="button" onClick={() => void submitTransfer()} disabled={!canSubmit}>
          <SendHorizontal size={16} aria-hidden="true" />
          <span>{isSubmitting ? 'Перенос' : 'Перенести'}</span>
        </button>
        <button
          className="primary-button warehouse-secondary"
          type="button"
          onClick={() => void loadOperationalData()}
          disabled={!selectedClientId || loadState === 'loading'}
        >
          <RefreshCw size={16} aria-hidden="true" />
          <span>Обновить</span>
        </button>
      </div>

      {result ? <TransferResult result={result} /> : null}
    </div>
  );
}

function keepSelectedBalance(current: string, balances: StockBalance[]) {
  if (balances.some((balance) => balance.id === current && balance.quantity > 0)) {
    return current;
  }

  return balances.find((balance) => balance.box?.code && balance.quantity > 0)?.id ?? '';
}

function buildIdempotencyKey(balanceId: string) {
  // Русский комментарий: ключ операции нужен для безопасного повтора, если браузер или сеть оборвут запрос.
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now());
  return `web-transfer:${balanceId}:${random}`;
}

function errorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : 'Не удалось выполнить складскую операцию.';
}
