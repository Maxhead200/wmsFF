import type { ClientCabinetFiltersValue } from './ClientCabinetFilters';

export type ClientCabinetFilterPreset = {
  id: string;
  name: string;
  filters: ClientCabinetFiltersValue;
  createdAt: string;
  updatedAt: string;
};

const STORAGE_PREFIX = 'logoff-wms:client-cabinet-filter-presets:v1';
const MAX_PRESETS = 12;

const emptyStoredFilters: ClientCabinetFiltersValue = {
  dateFrom: '',
  dateTo: '',
  requestStatus: '',
  invoiceStatus: '',
  chargeStatus: '',
  notificationState: '',
  fileState: '',
};

export function clientCabinetFilterPresetKey(userId: string, clientId: string) {
  return `${STORAGE_PREFIX}:${userId}:${clientId || 'all'}`;
}

export function loadClientCabinetFilterPresets(storageKey: string): ClientCabinetFilterPreset[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isStoredPreset).slice(0, MAX_PRESETS).map((preset) => ({
      ...preset,
      filters: normalizeStoredFilters(preset.filters),
    }));
  } catch {
    return [];
  }
}

export function saveClientCabinetFilterPresets(storageKey: string, presets: ClientCabinetFilterPreset[]) {
  // Русский комментарий: пресеты фильтров локальные для браузера, поэтому сохраняем только безопасный снимок формы.
  const payload = presets.slice(0, MAX_PRESETS).map((preset) => ({
    ...preset,
    filters: normalizeStoredFilters(preset.filters),
  }));
  window.localStorage.setItem(storageKey, JSON.stringify(payload));
}

function isStoredPreset(value: unknown): value is ClientCabinetFilterPreset {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const preset = value as Partial<ClientCabinetFilterPreset>;
  return (
    typeof preset.id === 'string' &&
    typeof preset.name === 'string' &&
    typeof preset.createdAt === 'string' &&
    typeof preset.updatedAt === 'string' &&
    Boolean(preset.filters)
  );
}

function normalizeStoredFilters(value: Partial<ClientCabinetFiltersValue> | undefined): ClientCabinetFiltersValue {
  return {
    ...emptyStoredFilters,
    ...value,
  };
}
