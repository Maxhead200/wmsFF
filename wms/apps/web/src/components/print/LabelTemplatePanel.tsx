import { FileText, History, Pencil, Plus, RefreshCw, Save } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  createLabelTemplate,
  fetchLabelTemplateVersions,
  fetchLabelTemplates,
  previewLabelTemplate,
  updateLabelTemplate,
  type AuthSession,
  type LabelPreview,
  type LabelTemplateSummary,
  type LabelTemplateType,
  type LabelTemplateVersionSummary,
} from '../../lib/api';
import { extractTemplateVariables, sampleVariableValue } from './templateVariables';
import { TsplPreviewCard } from './TsplPreviewCard';

type LabelTemplatePanelProps = {
  session: AuthSession;
};

const typeOptions: Array<{ value: LabelTemplateType; label: string }> = [
  { value: 'BOX', label: 'Короб' },
  { value: 'SKU', label: 'SKU' },
  { value: 'PALLET', label: 'Паллета' },
  { value: 'CUSTOM', label: 'Произвольный' },
];

const defaultTspl = [
  'SIZE 80 mm,50 mm',
  'GAP 2 mm,0',
  'CLS',
  'TEXT 40,35,"3",0,1,1,"{{clientName}}"',
  'BARCODE 40,95,"128",90,1,0,2,2,"{{boxCode}}"',
  'TEXT 40,205,"3",0,1,1,"Короб: {{boxCode}}"',
  'PRINT 1',
].join('\n');

export function LabelTemplatePanel({ session }: LabelTemplatePanelProps) {
  const [templates, setTemplates] = useState<LabelTemplateSummary[]>([]);
  const [versions, setVersions] = useState<LabelTemplateVersionSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [editingTemplateId, setEditingTemplateId] = useState('');
  const [code, setCode] = useState('BOX_MAIN');
  const [name, setName] = useState('Короб основная');
  const [type, setType] = useState<LabelTemplateType>('BOX');
  const [description, setDescription] = useState('');
  const [widthMm, setWidthMm] = useState('80');
  const [heightMm, setHeightMm] = useState('50');
  const [tspl, setTspl] = useState(defaultTspl);
  const [isActive, setIsActive] = useState(true);
  const [changeReason, setChangeReason] = useState('');
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<LabelPreview | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setLoading] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const [isPreviewing, setPreviewing] = useState(false);
  const [isLoadingVersions, setLoadingVersions] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedId) ?? null,
    [selectedId, templates],
  );
  const selectedVariables = useMemo(
    () => extractTemplateVariables(selectedTemplate?.tspl ?? ''),
    [selectedTemplate?.tspl],
  );
  const selectedVariableKey = selectedVariables.join('|');

  useEffect(() => {
    void loadTemplates();
  }, [session.accessToken]);

  useEffect(() => {
    if (selectedId) {
      void loadTemplateVersions(selectedId);
    } else {
      setVersions([]);
    }
  }, [selectedId, session.accessToken]);

  useEffect(() => {
    setVariableValues((current) => {
      const nextValues: Record<string, string> = {};
      selectedVariables.forEach((variable) => {
        nextValues[variable] = current[variable] ?? sampleVariableValue(variable);
      });
      return nextValues;
    });
    setPreview(null);
  }, [selectedVariableKey]);

  async function loadTemplates() {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const list = await fetchLabelTemplates(session.accessToken);
      setTemplates(list);
      setSelectedId((current) => (current && list.some((template) => template.id === current) ? current : list[0]?.id || ''));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить шаблоны этикеток.');
    } finally {
      setLoading(false);
    }
  }

  async function loadTemplateVersions(templateId: string) {
    setLoadingVersions(true);

    try {
      const list = await fetchLabelTemplateVersions(session.accessToken, templateId);
      setVersions(list);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить историю версий.');
    } finally {
      setLoadingVersions(false);
    }
  }

  async function submitTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    const payload = {
      code: code.trim(),
      name: name.trim(),
      type,
      description: description.trim() || undefined,
      widthMm: parsePositiveInteger(widthMm, 80),
      heightMm: parsePositiveInteger(heightMm, 50),
      tspl,
      isActive,
    };

    try {
      const saved = editingTemplateId
        ? await updateLabelTemplate(session.accessToken, editingTemplateId, {
            ...payload,
            changeReason: changeReason.trim() || 'Изменение шаблона из web-интерфейса',
          })
        : await createLabelTemplate(session.accessToken, payload);
      setTemplates((current) => [saved, ...current.filter((template) => template.id !== saved.id)]);
      setSelectedId(saved.id);
      setEditingTemplateId('');
      setChangeReason('');
      setMessage(`Шаблон сохранен как версия ${saved.version}.`);
      await loadTemplateVersions(saved.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить шаблон.');
    } finally {
      setSaving(false);
    }
  }

  async function previewSelectedTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTemplate) {
      return;
    }

    setPreviewing(true);
    setError('');
    setMessage('');
    setPreview(null);

    try {
      const nextPreview = await previewLabelTemplate(session.accessToken, selectedTemplate.id, {
        variables: variableValues,
      });
      setPreview(nextPreview);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось подготовить preview шаблона.');
    } finally {
      setPreviewing(false);
    }
  }

  function startEdit(template: LabelTemplateSummary) {
    setEditingTemplateId(template.id);
    setCode(template.code);
    setName(template.name);
    setType(template.type);
    setDescription(template.description ?? '');
    setWidthMm(String(template.widthMm));
    setHeightMm(String(template.heightMm));
    setTspl(template.tspl);
    setIsActive(template.isActive);
    setChangeReason('');
    setPreview(null);
    setMessage(`Редактируется ${template.code}, текущая версия ${template.version}.`);
    setError('');
  }

  function loadVersionIntoForm(version: LabelTemplateVersionSummary) {
    setEditingTemplateId(version.templateId);
    setCode(version.code);
    setName(version.name);
    setType(version.type);
    setDescription(version.description ?? '');
    setWidthMm(String(version.widthMm));
    setHeightMm(String(version.heightMm));
    setTspl(version.tspl);
    setIsActive(version.isActive);
    setChangeReason(`Возврат к версии ${version.version}`);
    setPreview(null);
  }

  function resetCreateForm() {
    setEditingTemplateId('');
    setCode('BOX_MAIN');
    setName('Короб основная');
    setType('BOX');
    setDescription('');
    setWidthMm('80');
    setHeightMm('50');
    setTspl(defaultTspl);
    setIsActive(true);
    setChangeReason('');
    setPreview(null);
    setMessage('');
    setError('');
  }

  const canSave = Boolean(code.trim() && name.trim() && tspl.trim());
  const canPreview = Boolean(selectedTemplate);
  const safeFileName = `${selectedTemplate?.code ?? 'template'}-v${selectedTemplate?.version ?? 1}-label.tspl`.replace(/[\\/:*?"<>|]/g, '_');

  return (
    <div className="print-template-layout">
      <form className="print-form print-template-create" onSubmit={submitTemplate}>
        <div className="print-template-header">
          <div>
            <h3>{editingTemplateId ? 'Редактирование шаблона' : 'Новый шаблон'}</h3>
            <span>{editingTemplateId ? 'Сохранение создаст следующую версию' : 'TSPL с переменными вида {{clientName}}'}</span>
          </div>
          <button className="review-action" type="button" onClick={resetCreateForm}>
            <Plus size={15} aria-hidden="true" />
            <span>Новый</span>
          </button>
        </div>

        <div className="print-fields print-fields--template">
          <label>
            <span>Код</span>
            <input value={code} onChange={(event) => setCode(event.target.value)} required />
          </label>

          <label>
            <span>Название</span>
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>

          <label>
            <span>Тип</span>
            <select value={type} onChange={(event) => setType(event.target.value as LabelTemplateType)}>
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Ширина, мм</span>
            <input min="20" max="150" step="1" type="number" value={widthMm} onChange={(event) => setWidthMm(event.target.value)} />
          </label>

          <label>
            <span>Высота, мм</span>
            <input min="20" max="150" step="1" type="number" value={heightMm} onChange={(event) => setHeightMm(event.target.value)} />
          </label>

          <label>
            <span>Описание</span>
            <input value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
        </div>

        <div className="print-switches">
          <label>
            <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
            <span>Активен</span>
          </label>
        </div>

        {editingTemplateId ? (
          <label className="print-template-editor">
            <span>Причина изменения</span>
            <input value={changeReason} onChange={(event) => setChangeReason(event.target.value)} />
          </label>
        ) : null}

        <label className="print-template-editor">
          <span>TSPL шаблон</span>
          <textarea value={tspl} onChange={(event) => setTspl(event.target.value)} required />
        </label>

        <div className="print-actions">
          <button className="primary-button" type="submit" disabled={!canSave || isSaving}>
            <Save size={16} aria-hidden="true" />
            <span>{isSaving ? 'Сохраняю' : editingTemplateId ? 'Сохранить версию' : 'Сохранить шаблон'}</span>
          </button>
          <button className="primary-button print-secondary" type="button" onClick={() => void loadTemplates()} disabled={isLoading}>
            <RefreshCw size={16} aria-hidden="true" />
            <span>Обновить список</span>
          </button>
        </div>
      </form>

      <form className="print-form print-template-preview" onSubmit={previewSelectedTemplate}>
        <div className="print-template-header">
          <div>
            <h3>Предпросмотр шаблона</h3>
            <span>{templates.length} сохранено</span>
          </div>
        </div>

        <div className="print-fields print-fields--template-preview">
          <label>
            <span>Шаблон</span>
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={isLoading}>
              {templates.length === 0 ? <option value="">Шаблонов нет</option> : null}
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.code} - {template.name} · v{template.version}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedTemplate ? (
          <div className="print-template-card">
            <div className="print-template-card__top">
              <span className="status status--ready">v{selectedTemplate.version}</span>
              <button className="review-action" type="button" onClick={() => startEdit(selectedTemplate)}>
                <Pencil size={15} aria-hidden="true" />
                <span>Редактировать</span>
              </button>
            </div>
            <strong>{selectedTemplate.name}</strong>
            <small>
              {selectedTemplate.widthMm} x {selectedTemplate.heightMm} мм · {selectedTemplate.type}
            </small>
            <small>{selectedTemplate.isActive ? 'Активен' : 'Отключен'}</small>
          </div>
        ) : null}

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
          <p className="panel-message">В шаблоне нет переменных, предпросмотр можно построить без заполнения.</p>
        )}

        {(error || message) ? <p className={error ? 'form-error' : 'inline-status'}>{error || message}</p> : null}

        <div className="print-actions">
          <button className="primary-button" type="submit" disabled={!canPreview || isPreviewing}>
            <FileText size={16} aria-hidden="true" />
            <span>{isPreviewing ? 'Готовлю' : 'Предпросмотр TSPL'}</span>
          </button>
        </div>

        {preview ? <TsplPreviewCard preview={preview} fileName={safeFileName} /> : null}

        <div className="print-template-history">
          <div className="print-template-history__header">
            <History size={16} aria-hidden="true" />
            <strong>История версий</strong>
            {isLoadingVersions ? <span>Загрузка</span> : null}
          </div>
          {versions.length === 0 ? <p className="panel-message">История пока пустая.</p> : null}
          {versions.map((version) => (
            <div className="print-template-version" key={version.id}>
              <div>
                <strong>
                  v{version.version} · {version.code}
                </strong>
                <small>{formatDate(version.createdAt)}</small>
                {version.changeReason ? <small>{version.changeReason}</small> : null}
              </div>
              <button className="review-action" type="button" onClick={() => loadVersionIntoForm(version)}>
                <Pencil size={15} aria-hidden="true" />
                <span>В форму</span>
              </button>
            </div>
          ))}
        </div>
      </form>
    </div>
  );
}

function parsePositiveInteger(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
