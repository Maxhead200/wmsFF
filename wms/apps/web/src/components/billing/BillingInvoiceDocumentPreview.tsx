import { Download, Printer, X } from 'lucide-react';
import type { BillingInvoiceDocument } from '../../lib/api';
import './billing-document.css';

type BillingInvoiceDocumentPreviewProps = {
  document: BillingInvoiceDocument;
  onClose: () => void;
};

export function BillingInvoiceDocumentPreview({ document, onClose }: BillingInvoiceDocumentPreviewProps) {
  function openPrintableDocument() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      return;
    }

    printWindow.document.open();
    printWindow.document.write(document.html);
    printWindow.document.close();
    printWindow.focus();
  }

  function downloadHtml() {
    const blob = new Blob([document.html], { type: 'text/html;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = document.fileName;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }

  return (
    <div className="billing-document-backdrop" role="dialog" aria-modal="true" aria-label={document.title}>
      <section className="billing-document-modal">
        <header className="billing-document-modal__header">
          <div>
            <p className="eyebrow">Документ</p>
            <h2>{document.title}</h2>
          </div>
          <div className="billing-document-modal__actions">
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

        <iframe className="billing-document-frame" title={document.title} srcDoc={document.html} />
      </section>
    </div>
  );
}
