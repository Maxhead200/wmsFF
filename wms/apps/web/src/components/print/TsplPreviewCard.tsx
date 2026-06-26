import { Download } from 'lucide-react';
import type { LabelPreview } from '../../lib/api';

type TsplPreviewCardProps = {
  preview: LabelPreview;
  fileName: string;
};

export function TsplPreviewCard({ preview, fileName }: TsplPreviewCardProps) {
  function downloadTspl() {
    const blob = new Blob([preview.tspl], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="print-preview">
      <div className="print-preview__header">
        <div>
          <strong>{preview.printerLanguage}</strong>
          <span>Команда для TSC/TSPL принтера</span>
        </div>
        <button className="icon-button" type="button" onClick={downloadTspl} title="Скачать TSPL" aria-label="Скачать TSPL">
          <Download size={18} aria-hidden="true" />
        </button>
      </div>

      <textarea readOnly value={preview.tspl} aria-label="Предпросмотр TSPL" />
    </div>
  );
}
