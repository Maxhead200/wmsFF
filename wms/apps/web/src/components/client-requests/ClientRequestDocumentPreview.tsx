import type { ClientRequestDocument } from '../../lib/api';
import { HtmlDocumentPreview } from '../documents/HtmlDocumentPreview';

type ClientRequestDocumentPreviewProps = {
  document: ClientRequestDocument;
  onClose: () => void;
};

export function ClientRequestDocumentPreview({ document, onClose }: ClientRequestDocumentPreviewProps) {
  return <HtmlDocumentPreview title={document.title} fileName={document.fileName} html={document.html} onClose={onClose} />;
}
