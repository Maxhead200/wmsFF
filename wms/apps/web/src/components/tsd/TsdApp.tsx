import { CheckCircle2, CloudOff, LogOut, PackageCheck, RefreshCw, ScanLine, Wifi } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  fetchTsdClients,
  fetchTsdSkuByBarcode,
  login,
  syncTsdOperations,
  type AuthSession,
  type TsdClientSummary,
  type TsdOperationResult,
  type TsdScanOperation,
  type TsdSkuSummary,
} from '../../lib/api';
import './tsd-app.css';

type TsdReceiptLine = {
  operationKey: string;
  boxCode: string;
  barcode: string;
  kiz: string;
  status: 'queued' | 'synced' | 'review' | 'error';
  message: string;
  createdAt: string;
};

type TsdStoredState = {
  session: AuthSession | null;
  deviceCode: string;
  confirmedBarcodes: string[];
  queue: TsdScanOperation[];
  lines: TsdReceiptLine[];
  receiptId: string;
};

const storageKey = 'logoff-tsd-state-v1';

export function TsdApp() {
  const initial = useMemo(loadTsdState, []);
  const [session, setSession] = useState<AuthSession | null>(initial.session);
  const [deviceCode, setDeviceCode] = useState(initial.deviceCode);
  const [confirmedBarcodes, setConfirmedBarcodes] = useState<Set<string>>(() => new Set(initial.confirmedBarcodes));
  const [clients, setClients] = useState<TsdClientSummary[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [screen, setScreen] = useState<'menu' | 'receipt'>('menu');
  const [receiptId, setReceiptId] = useState(initial.receiptId);
  const [queue, setQueue] = useState<TsdScanOperation[]>(initial.queue);
  const [lines, setLines] = useState<TsdReceiptLine[]>(initial.lines);
  const [loginForm, setLoginForm] = useState({ email: '', password: '', deviceCode: initial.deviceCode });
  const [boxCode, setBoxCode] = useState('');
  const [boxInput, setBoxInput] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [kizInput, setKizInput] = useState('');
  const [pendingBarcode, setPendingBarcode] = useState('');
  const [skuConfirm, setSkuConfirm] = useState<{ barcode: string; sku: TsdSkuSummary } | null>(null);
  const [message, setMessage] = useState('');
  const [isOnline, setOnline] = useState(() => navigator.onLine);
  const [isSyncing, setSyncing] = useState(false);
  const barcodeRef = useRef<HTMLInputElement | null>(null);
  const kizRef = useRef<HTMLInputElement | null>(null);
  const boxRef = useRef<HTMLInputElement | null>(null);

  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? null;
  const currentBoxLines = lines.filter((line) => line.boxCode === boxCode);
  const queuedCount = queue.length;

  useEffect(() => {
    saveTsdState({ session, deviceCode, confirmedBarcodes: [...confirmedBarcodes], queue, lines, receiptId });
  }, [session, deviceCode, confirmedBarcodes, queue, lines, receiptId]);

  useEffect(() => {
    function updateOnline() {
      setOnline(navigator.onLine);
    }

    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    void loadClients(session.accessToken);
  }, [session]);

  useEffect(() => {
    if (session && isOnline && queue.length > 0) {
      void flushQueue();
    }
  }, [session, isOnline, queue.length]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (session && navigator.onLine && queue.length > 0) {
        void flushQueue();
      }
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [session, queue.length]);

  useEffect(() => {
    if (screen !== 'receipt') {
      return;
    }

    window.setTimeout(() => {
      if (!boxCode) {
        boxRef.current?.focus();
      } else if (pendingBarcode) {
        kizRef.current?.focus();
      } else {
        barcodeRef.current?.focus();
      }
    }, 80);
  }, [screen, boxCode, pendingBarcode]);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    try {
      const nextSession = await login({
        email: loginForm.email,
        password: loginForm.password,
      });
      setSession(nextSession);
      const nextDeviceCode = normalizeDeviceCode(loginForm.deviceCode || deviceCode);
      setDeviceCode(nextDeviceCode);
      setLoginForm((current) => ({ ...current, password: '', deviceCode: nextDeviceCode }));
      setMessage(`Сборщик ${nextSession.user.name} подключен.`);
    } catch (caught) {
      setMessage(errorMessage(caught));
    }
  }

  async function loadClients(accessToken = session?.accessToken) {
    if (!accessToken) {
      return;
    }

    try {
      const loaded = await fetchTsdClients(accessToken);
      setClients(loaded);
      setSelectedClientId((current) => (loaded.some((client) => client.id === current) ? current : loaded[0]?.id ?? ''));
    } catch (caught) {
      setMessage(errorMessage(caught));
    }
  }

  function logout() {
    setSession(null);
    setClients([]);
    setSelectedClientId('');
    setScreen('menu');
    setMessage('Вы вышли из ТСД.');
  }

  function startReceipt() {
    setScreen('receipt');
    setBoxCode('');
    setBoxInput('');
    setBarcodeInput('');
    setKizInput('');
    setPendingBarcode('');
    setMessage('');
  }

  function submitBox(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = boxInput.trim();
    if (!selectedClient) {
      setMessage('Сначала выберите клиента.');
      return;
    }
    if (!normalized) {
      setMessage('Сканируйте номер короба.');
      return;
    }

    setBoxCode(normalized);
    setBoxInput('');
    setMessage(`Короб ${normalized} открыт.`);
  }

  async function submitBarcode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = barcodeInput.trim();
    if (!boxCode) {
      setMessage('Сначала откройте короб.');
      return;
    }
    if (!normalized) {
      setMessage('Сканируйте штрихкод товара.');
      return;
    }

    if (!confirmedBarcodes.has(normalized)) {
      await openSkuConfirmation(normalized);
      return;
    }

    setPendingBarcode(normalized);
    setBarcodeInput('');
    setMessage('Теперь сканируйте КИЗ.');
  }

  async function openSkuConfirmation(barcode: string) {
    if (!session || !selectedClient) {
      setMessage('Сначала выберите клиента.');
      return;
    }

    try {
      const sku = await fetchTsdSkuByBarcode(session.accessToken, selectedClient.id, barcode);
      setSkuConfirm({ barcode, sku });
      setMessage('Проверьте товар на экране и подтвердите.');
    } catch (caught) {
      setMessage(errorMessage(caught));
    }
  }

  function confirmSku() {
    if (!skuConfirm) {
      return;
    }

    setConfirmedBarcodes((current) => new Set([...current, skuConfirm.barcode]));
    setPendingBarcode(skuConfirm.barcode);
    setBarcodeInput('');
    setSkuConfirm(null);
    setMessage('Товар подтвержден. Теперь сканируйте КИЗ.');
  }

  async function submitKiz(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = kizInput.trim();
    if (!session || !selectedClient || !boxCode || !pendingBarcode) {
      setMessage('Не хватает клиента, короба или штрихкода товара.');
      return;
    }
    if (!normalized) {
      setMessage('Сканируйте КИЗ.');
      return;
    }
    if (lines.some((line) => line.kiz === normalized)) {
      setMessage('Этот КИЗ уже есть в текущей приемке.');
      setKizInput('');
      return;
    }

    const operation = buildReceiptOperation({
      deviceCode,
      clientId: selectedClient.id,
      boxCode,
      barcode: pendingBarcode,
      kiz: normalized,
      receiptId,
    });
    const localLine: TsdReceiptLine = {
      operationKey: operation.operationKey,
      boxCode,
      barcode: pendingBarcode,
      kiz: normalized,
      status: navigator.onLine ? 'queued' : 'queued',
      message: navigator.onLine ? 'Ожидает подтверждения WMS' : 'Нет интернета, сохранено на ТСД',
      createdAt: new Date().toISOString(),
    };

    setLines((current) => [localLine, ...current]);
    setQueue((current) => [...current, operation]);
    setPendingBarcode('');
    setKizInput('');
    setMessage('Товар добавлен в короб.');

    if (navigator.onLine) {
      await flushQueue([...queue, operation]);
    }
  }

  function closeBox() {
    setMessage(`Короб ${boxCode} закрыт. Можно открыть новый короб или закончить приемку.`);
    setBoxCode('');
    setPendingBarcode('');
    setBarcodeInput('');
    setKizInput('');
  }

  function finishReceipt() {
    setScreen('menu');
    setBoxCode('');
    setPendingBarcode('');
    setConfirmedBarcodes(new Set());
    setReceiptId(createReceiptId());
    setMessage(queuedCount > 0 ? 'Приемка завершена локально. Очередь отправится при появлении интернета.' : 'Приемка завершена.');
    if (navigator.onLine && queue.length > 0) {
      void flushQueue();
    }
  }

  async function flushQueue(operations = queue) {
    if (!session || operations.length === 0 || isSyncing) {
      return;
    }

    setSyncing(true);
    try {
      const results = await syncTsdOperations(session.accessToken, operations);
      const doneKeys = new Set(results.map((result) => result.operationKey));
      setQueue((current) => current.filter((operation) => !doneKeys.has(operation.operationKey)));
      setLines((current) => applySyncResults(current, results));
      setMessage(syncMessage(results));
    } catch (caught) {
      setMessage(`Синхронизация не прошла: ${errorMessage(caught)}`);
    } finally {
      setSyncing(false);
    }
  }

  if (!session) {
    return (
      <main className="tsd-shell">
        <SplashLogo />
        <form className="tsd-card tsd-login" onSubmit={(event) => void submitLogin(event)}>
          <h1>Вход сборщика</h1>
          <label>
            <span>Логин</span>
            <input autoComplete="username" value={loginForm.email} onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })} />
          </label>
          <label>
            <span>Пароль</span>
            <input autoComplete="current-password" type="password" value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} />
          </label>
          <label>
            <span>Код ТСД / места</span>
            <input autoCapitalize="characters" value={loginForm.deviceCode} onChange={(event) => setLoginForm({ ...loginForm, deviceCode: event.target.value })} />
          </label>
          <button className="tsd-primary" type="submit">Подключиться к WMS</button>
          {message ? <p className="tsd-message tsd-message--error">{message}</p> : null}
        </form>
      </main>
    );
  }

  return (
    <main className="tsd-app">
      <header className="tsd-topbar">
        <SplashLogo compact />
        <div>
          <strong>{session.user.name}</strong>
          <span>{deviceCode || 'ТСД'}</span>
        </div>
        <span className={isOnline ? 'tsd-net tsd-net--online' : 'tsd-net tsd-net--offline'}>
          {isOnline ? <Wifi size={16} /> : <CloudOff size={16} />}
          {isOnline ? 'онлайн' : 'офлайн'}
        </span>
      </header>

      <section className="tsd-status-row">
        <span>Очередь: {queuedCount}</span>
        <button type="button" onClick={() => void flushQueue()} disabled={!isOnline || queuedCount === 0 || isSyncing}>
          <RefreshCw size={16} /> Синхронизировать
        </button>
        <button type="button" onClick={logout}>
          <LogOut size={16} /> Выйти
        </button>
      </section>

      {message ? <p className="tsd-message">{message}</p> : null}

      {screen === 'menu' ? (
        <section className="tsd-card tsd-menu">
          <label>
            <span>Клиент</span>
            <select value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)}>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>
          <button className="tsd-big-action" type="button" onClick={startReceipt} disabled={!selectedClientId}>
            <PackageCheck size={28} />
            <span>Приемка товара</span>
          </button>
        </section>
      ) : null}

      {screen === 'receipt' ? (
        <section className="tsd-receipt">
          <div className="tsd-card tsd-receipt-head">
            <div>
              <span>Клиент</span>
              <strong>{selectedClient?.name ?? '-'}</strong>
            </div>
            <div>
              <span>Короб</span>
              <strong>{boxCode || 'не открыт'}</strong>
            </div>
          </div>

          {!boxCode ? (
            <form className="tsd-card tsd-scan-form" onSubmit={submitBox}>
              <h2>Новый короб</h2>
              <label>
                <span>Скан номера короба</span>
                <input ref={boxRef} value={boxInput} onChange={(event) => setBoxInput(event.target.value)} />
              </label>
              <button className="tsd-primary" type="submit">
                <ScanLine size={20} /> Открыть короб
              </button>
              {lines.length > 0 ? (
                <button className="tsd-secondary" type="button" onClick={finishReceipt}>
                  Закончить приемку
                </button>
              ) : null}
            </form>
          ) : (
            <>
              {!pendingBarcode ? (
                <form className="tsd-card tsd-scan-form" onSubmit={submitBarcode}>
                  <h2>Скан товара</h2>
                  <label>
                    <span>Штрихкод товара</span>
                    <input ref={barcodeRef} value={barcodeInput} onChange={(event) => setBarcodeInput(event.target.value)} />
                  </label>
                  <button className="tsd-primary" type="submit">
                    <ScanLine size={20} /> Принять ШК товара
                  </button>
                </form>
              ) : (
                <form className="tsd-card tsd-scan-form" onSubmit={(event) => void submitKiz(event)}>
                  <h2>Скан КИЗ</h2>
                  <p className="tsd-current-barcode">{pendingBarcode}</p>
                  <label>
                    <span>КИЗ товара</span>
                    <input ref={kizRef} value={kizInput} onChange={(event) => setKizInput(event.target.value)} />
                  </label>
                  <button className="tsd-primary" type="submit">
                    <CheckCircle2 size={20} /> Записать товар
                  </button>
                  <button className="tsd-secondary" type="button" onClick={() => setPendingBarcode('')}>
                    Отменить ШК
                  </button>
                </form>
              )}

              <div className="tsd-actions-grid">
                <button className="tsd-secondary" type="button" onClick={closeBox}>
                  Закрыть короб
                </button>
                <button className="tsd-secondary" type="button" onClick={finishReceipt}>
                  Закончить приемку
                </button>
              </div>
            </>
          )}

          <section className="tsd-card tsd-lines">
            <strong>В коробе: {currentBoxLines.length}</strong>
            {lines.slice(0, 12).map((line) => (
              <article className={`tsd-line tsd-line--${line.status}`} key={line.operationKey}>
                <span>{line.boxCode}</span>
                <strong>{line.barcode}</strong>
                <small>{line.kiz}</small>
                <em>{line.message}</em>
              </article>
            ))}
          </section>
        </section>
      ) : null}

      {skuConfirm ? (
        <div className="tsd-modal-backdrop" role="dialog" aria-modal="true" aria-label="Подтверждение товара">
          <section className="tsd-card tsd-sku-modal">
            <h2>Проверьте товар</h2>
            <p className="tsd-current-barcode">{skuConfirm.barcode}</p>
            <div className="tsd-sku-facts">
              <div>
                <span>Название</span>
                <strong>{skuConfirm.sku.name}</strong>
              </div>
              <div>
                <span>Артикул</span>
                <strong>{skuConfirm.sku.article || skuConfirm.sku.clientSku || skuConfirm.sku.internalSku}</strong>
              </div>
              <div>
                <span>Размер / цвет</span>
                <strong>{[skuConfirm.sku.size, skuConfirm.sku.color].filter(Boolean).join(' / ') || '-'}</strong>
              </div>
              <div>
                <span>Бренд</span>
                <strong>{skuConfirm.sku.brand || '-'}</strong>
              </div>
            </div>
            <button className="tsd-primary" type="button" onClick={confirmSku}>
              Да, это этот товар
            </button>
            <button
              className="tsd-secondary"
              type="button"
              onClick={() => {
                setSkuConfirm(null);
                setBarcodeInput('');
                setMessage('Скан товара отменен.');
              }}
            >
              Нет, отменить
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function SplashLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'tsd-logo tsd-logo--compact' : 'tsd-logo'} aria-label="LOGOff">
      <span>LOG</span>
      <strong>Off</strong>
    </div>
  );
}

function buildReceiptOperation(input: {
  deviceCode: string;
  clientId: string;
  boxCode: string;
  barcode: string;
  kiz: string;
  receiptId: string;
}): TsdScanOperation {
  const now = Date.now();
  const operationKey = ['tsd-receipt', input.deviceCode, input.receiptId, input.boxCode, input.kiz, now].join(':');
  return {
    deviceId: input.deviceCode,
    operationKey,
    operationType: 'receipt_scan',
    payload: {
      clientId: input.clientId,
      boxCode: input.boxCode,
      barcode: input.barcode,
      kiz: input.kiz,
      quantity: 1,
      status: 'AVAILABLE',
      sourceDocument: input.receiptId,
      comment: `Приемка ТСД ${input.deviceCode}`,
    },
  };
}

function applySyncResults(lines: TsdReceiptLine[], results: TsdOperationResult[]) {
  const byKey = new Map(results.map((result) => [result.operationKey, result]));
  return lines.map((line) => {
    const result = byKey.get(line.operationKey);
    if (!result) {
      return line;
    }

    if (result.status === 'APPLIED' || result.status === 'ALREADY_APPLIED' || result.status === 'ACCEPTED') {
      return { ...line, status: 'synced' as const, message: result.status === 'ALREADY_APPLIED' ? 'Уже было в WMS' : 'Записано в WMS' };
    }

    if (result.status === 'NEEDS_REVIEW') {
      return { ...line, status: 'review' as const, message: result.message ?? 'Требует разбора' };
    }

    return { ...line, status: 'error' as const, message: result.message ?? 'Отклонено WMS' };
  });
}

function syncMessage(results: TsdOperationResult[]) {
  const applied = results.filter((result) => ['APPLIED', 'ALREADY_APPLIED', 'ACCEPTED'].includes(result.status)).length;
  const review = results.filter((result) => result.status === 'NEEDS_REVIEW').length;
  const rejected = results.filter((result) => result.status === 'REJECTED').length;
  return `Синхронизация: записано ${applied}, на разбор ${review}, отклонено ${rejected}.`;
}

function createReceiptId() {
  return `TSD-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function loadTsdState(): TsdStoredState {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return { session: null, deviceCode: 'TSD-01', confirmedBarcodes: [], queue: [], lines: [], receiptId: createReceiptId() };
    }

    const parsed = JSON.parse(raw) as Partial<TsdStoredState>;
    return {
      session: parsed.session ?? null,
      deviceCode: parsed.deviceCode ?? 'TSD-01',
      confirmedBarcodes: parsed.confirmedBarcodes ?? [],
      queue: parsed.queue ?? [],
      lines: parsed.lines ?? [],
      receiptId: parsed.receiptId ?? createReceiptId(),
    };
  } catch {
    return { session: null, deviceCode: 'TSD-01', confirmedBarcodes: [], queue: [], lines: [], receiptId: createReceiptId() };
  }
}

function saveTsdState(state: TsdStoredState) {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function errorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : 'Не удалось выполнить действие.';
}

function normalizeDeviceCode(value: string) {
  return value.trim().toUpperCase() || 'TSD-01';
}
