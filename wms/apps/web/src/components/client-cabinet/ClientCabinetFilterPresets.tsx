import { Bookmark, Check, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ClientCabinetFiltersValue } from './ClientCabinetFilters';
import {
  clientCabinetFilterPresetKey,
  loadClientCabinetFilterPresets,
  saveClientCabinetFilterPresets,
  type ClientCabinetFilterPreset,
} from './clientCabinetFilterPresetStorage';

type ClientCabinetFilterPresetsProps = {
  userId: string;
  clientId: string;
  value: ClientCabinetFiltersValue;
  onApply: (value: ClientCabinetFiltersValue) => void;
};

export function ClientCabinetFilterPresets({ userId, clientId, value, onApply }: ClientCabinetFilterPresetsProps) {
  const storageKey = useMemo(() => clientCabinetFilterPresetKey(userId, clientId), [clientId, userId]);
  const [presets, setPresets] = useState<ClientCabinetFilterPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [presetName, setPresetName] = useState('');
  const [message, setMessage] = useState('');
  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId) ?? null;
  const hasActiveFilters = Object.values(value).some(Boolean);

  useEffect(() => {
    const nextPresets = loadClientCabinetFilterPresets(storageKey);
    setPresets(nextPresets);
    setSelectedPresetId(nextPresets[0]?.id ?? '');
    setPresetName('');
    setMessage('');
  }, [storageKey]);

  function persist(nextPresets: ClientCabinetFilterPreset[]) {
    saveClientCabinetFilterPresets(storageKey, nextPresets);
    setPresets(nextPresets);
  }

  function savePreset() {
    const name = presetName.trim();
    if (!name) {
      setMessage('Введите название представления.');
      return;
    }

    const now = new Date().toISOString();
    const existing = presets.find((preset) => preset.name.toLowerCase() === name.toLowerCase());
    const nextPreset: ClientCabinetFilterPreset = {
      id: existing?.id ?? createPresetId(),
      name,
      filters: value,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const nextPresets = [nextPreset, ...presets.filter((preset) => preset.id !== nextPreset.id)].slice(0, 12);

    persist(nextPresets);
    setSelectedPresetId(nextPreset.id);
    setMessage(existing ? 'Представление обновлено.' : 'Представление сохранено.');
  }

  function applyPreset() {
    if (!selectedPreset) {
      return;
    }

    onApply(selectedPreset.filters);
    setMessage(`Применено: ${selectedPreset.name}.`);
  }

  function deletePreset() {
    if (!selectedPreset) {
      return;
    }

    const nextPresets = presets.filter((preset) => preset.id !== selectedPreset.id);
    persist(nextPresets);
    setSelectedPresetId(nextPresets[0]?.id ?? '');
    setMessage('Представление удалено.');
  }

  return (
    <section className="client-cabinet-presets" aria-label="Сохраненные представления фильтров">
      <div className="client-cabinet-presets__title">
        <Bookmark size={17} aria-hidden="true" />
        <div>
          <h3>Представления</h3>
          <span>{presets.length > 0 ? `${presets.length} сохранено` : 'нет сохраненных'}</span>
        </div>
      </div>

      <label className="client-cabinet-presets__name">
        <span>Название</span>
        <input value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="Например: долги за месяц" />
      </label>

      <label className="client-cabinet-presets__select">
        <span>Открыть</span>
        <select
          value={selectedPresetId}
          onChange={(event) => {
            setSelectedPresetId(event.target.value);
            setMessage('');
          }}
          disabled={presets.length === 0}
        >
          {presets.length === 0 ? <option value="">Нет сохраненных</option> : null}
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
      </label>

      <div className="client-cabinet-presets__actions">
        <button className="icon-text-button" type="button" onClick={savePreset} disabled={!hasActiveFilters}>
          <Save size={15} aria-hidden="true" />
          <span>Сохранить</span>
        </button>
        <button className="icon-text-button" type="button" onClick={applyPreset} disabled={!selectedPreset}>
          <Check size={15} aria-hidden="true" />
          <span>Применить</span>
        </button>
        <button className="icon-text-button" type="button" onClick={deletePreset} disabled={!selectedPreset}>
          <Trash2 size={15} aria-hidden="true" />
          <span>Удалить</span>
        </button>
      </div>

      {message ? <p className="inline-status client-cabinet-presets__message">{message}</p> : null}
    </section>
  );
}

function createPresetId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
