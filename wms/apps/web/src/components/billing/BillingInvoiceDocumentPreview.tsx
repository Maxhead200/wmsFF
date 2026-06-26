import type { BillingInvoiceDocument } from '../../lib/api';
import { HtmlDocumentPreview } from '../documents/HtmlDocumentPreview';

type BillingInvoiceDocumentPreviewProps = {
  document: BillingInvoiceDocument;
  onClose: () => void;
};

export function BillingInvoiceDocumentPreview({ document, onClose }: BillingInvoiceDocumentPreviewProps) {
  return <HtmlDocumentPreview title={document.title} fileName={document.fileName} html={document.html} onClose={onClose} />;
}
