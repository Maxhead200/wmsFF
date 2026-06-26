import { FileText, RefreshCw, Save } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  createLabelTemplate,
  fetchLabelTemplates,
  previewLabelTemplate,
  type AuthSession,
  type LabelPreview,
  type LabelTemplateSummary,
  type LabelTemplateType,
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
  const [selectedId, setSelectedId] = useState('');
  const [code, setCode] = useState('BOX_MAIN');
  const [name, setName] = useState('Короб основная');
  const [type, setType] = useState<LabelTemplateType>('BOX');
  const [description, setDescription] = useState('');
  const [widthMm, setWidthMm] = useState('80');
  const [heightMm, setHeightMm] = useState('50');
  const [tspl, setTspl] = useState(defaultTspl);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<LabelPreview | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setLoading] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const [isPreviewing, setPreviewing] = useState(false);

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
      setSelectedId((current) => current || list[0]?.id || '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить шаблоны этикеток.');
    } finally {
      setLoading(false);
    }
  }

  async function submitTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const created = await createLabelTemplate(session.accessToken, {
        code: code.trim(),
        name: name.trim(),
        type,
        description: description.trim() || undefined,
        widthMm: parsePositiveInteger(widthMm, 80),
        heightMm: parsePositiveInteger(heightMm, 50),
        tspl,
        isActive: true,
      });
      setTemplates((current) => [created, ...current.filter((template) => template.id !== created.id)]);
      setSelectedId(created.id);
      setMessage('Шаблон сохранен.');
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

  const canSave = Boolean(code.trim() && name.trim() && tspl.trim());
  const canPreview = Boolean(selectedTemplate);
  const safeFileName = `${selectedTemplate?.code ?? 'template'}-label.tspl`.replace(/[\\/:*?"<>|]/g, '_');

  return (
    <div className="print-template-layout">
      <form className="print-form print-template-create" onSubmit={submitTemplate}>
        <div className="print-template-header">
          <div>
            <h3>Новый шаблон</h3>
            <span>{'TSPL с переменными вида {{clientName}}'}</span>
          </div>
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

        <label className="print-template-editor">
          <span>TSPL шаблон</span>
          <textarea value={tspl} onChange={(event) => setTspl(event.target.value)} required />
        </label>

        <div className="print-actions">
          <button className="primary-button" type="submit" disabled={!canSave || isSaving}>
            <Save size={16} aria-hidden="true" />
            <span>{isSaving ? 'Сохраняю' : 'Сохранить шаблон'}</span>
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
            <h3>Preview шаблона</h3>
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
                  {template.code} - {template.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedTemplate ? (
          <div className="print-template-card">
            <span className="status status--ready">{selectedTemplate.type}</span>
            <strong>{selectedTemplate.name}</strong>
            <small>
              {selectedTemplate.widthMm} x {selectedTemplate.heightMm} мм
            </small>
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
          <p className="panel-message">В шаблоне нет переменных, preview можно построить без заполнения.</p>
        )}

        {(error || message) ? <p className={error ? 'form-error' : 'inline-status'}>{error || message}</p> : null}

        <div className="print-actions">
          <button className="primary-button" type="submit" disabled={!canPreview || isPreviewing}>
            <FileText size={16} aria-hidden="true" />
            <span>{isPreviewing ? 'Готовлю' : 'Preview TSPL'}</span>
          </button>
        </div>

        {preview ? <TsplPreviewCard preview={preview} fileName={safeFileName} /> : null}
      </form>
    </div>
  );
}

function parsePositiveInteger(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
