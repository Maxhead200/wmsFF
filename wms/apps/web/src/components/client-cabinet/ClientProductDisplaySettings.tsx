import { useEffect, useState } from 'react';
import { fetchProductDisplay, saveProductDisplay, type ProductDisplayField } from '../../lib/api';

const choices: Array<[ProductDisplayField, string]> = [
  ['name', 'Наименование'], ['article', 'Артикул'], ['barcode', 'Штрихкод'], ['size', 'Размер'], ['color', 'Цвет'],
];

// FIX: changes apply to this client only and are explicitly saved.
export function ClientProductDisplaySettings({ accessToken, clientId }: { accessToken: string; clientId: string }) {
  const [fields, setFields] = useState<ProductDisplayField[] | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    let active = true;
    setReady(false); setMessage(''); setLoadError('');
    fetchProductDisplay(accessToken, clientId).then(result => {
      if (active) { setFields(result.fields); setReady(true); }
    }).catch(error => {
      if (active) setLoadError(error instanceof Error ? error.message : 'Не удалось загрузить настройку.');
    });
    return () => { active = false; };
  }, [accessToken, clientId]);
  async function save() {
    setBusy(true); setMessage('');
    try {
      await saveProductDisplay(accessToken, clientId, fields);
      setMessage('Сохранено. Обновите экран сборки или упаковки, чтобы применить настройку.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось сохранить.'); }
    finally { setBusy(false); }
  }
  // FIX: keep disabled deployments unchanged, but never silently hide a failed enabled setting.
  if (loadError.includes('Настройка отображения товаров не включена')) return null;
  return <section className="client-product-display" aria-label="Отображение товара при сборке и упаковке"
    style={{ padding: 20, margin: '16px 0', border: '1px solid var(--line)', borderRadius: 12 }}>
    <h3>Отображение товара при сборке и упаковке</h3>
    {!ready ? <p role={loadError ? 'alert' : 'status'}>{loadError || 'Загружаю настройку отображения…'}</p> : <>
    <p>Настройка клиента для ВМС и ТСД. Выберите поля, которые видит сотрудник.</p>
    <label><input type="checkbox" checked={fields === null} disabled={busy}
      onChange={event => setFields(event.target.checked ? null : choices.map(([field]) => field))} /> Использовать прежнее отображение</label>
    <fieldset disabled={busy || fields === null}><legend>Поля товара</legend>
      {choices.map(([field, title]) => <label key={field} style={{ marginRight: 16 }}><input type="checkbox"
        checked={fields?.includes(field) ?? false}
        onChange={event => setFields(previous => choices.map(([key]) => key).filter(key => key === field ? event.target.checked : previous?.includes(key)))} /> {title}</label>)}
    </fieldset>
    {fields?.length === 0 && <p role="alert">Выберите хотя бы одно поле.</p>}
    <button type="button" disabled={busy || fields?.length === 0} onClick={() => void save()}>{busy ? 'Сохранение…' : 'Сохранить отображение'}</button>
    {message && <p role="status">{message}</p>}
    </>}
  </section>;
}
