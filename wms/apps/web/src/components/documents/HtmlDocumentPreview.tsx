import { Download, Printer, X } from 'lucide-react';
import './document-preview.css';

type HtmlDocumentPreviewProps = {
  title: string;
  fileName: string;
  html: string;
  onClose: () => void;
};

export function HtmlDocumentPreview({ title, fileName, html, onClose }: HtmlDocumentPreviewProps) {
  function openPrintableDocument() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
  }

  function downloadHtml() {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }

  return (
    <div className="document-preview-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <section className="document-preview-modal">
        <header className="document-preview-modal__header">
          <div>
            <p className="eyebrow">Документ</p>
            <h2>{title}</h2>
          </div>
          <div className="document-preview-modal__actions">
            <button className="icon-button" type="button" onClick={downloadHtml} title="Скачать HTML" aria-label="Скачать HTML">
              <Download size={18} aria-hidden="true" />
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={openPrintableDocument}
              title="Открыть печать"
              aria-label="Открыть печатный документ"
            >
              <Printer size={18} aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" onClick={onClose} title="Закрыть" aria-label="Закрыть документ">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        <iframe className="document-preview-frame" title={title} srcDoc={html} />
      </section>
    </div>
  );
}
