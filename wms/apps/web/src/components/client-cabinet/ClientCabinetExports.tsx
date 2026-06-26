import { FileArchive, FileDown, Files, ReceiptText } from 'lucide-react';
import { useState } from 'react';
import type {
  BillingChargeSummary,
  BillingInvoiceSummary,
  BillingServiceHistory,
  ClientRequestSummary,
  ClientSummary,
} from '../../lib/api';
import type { ClientCabinetFiltersValue } from './ClientCabinetFilters';
import {
  downloadClientCabinetDocumentsCsv,
  downloadClientCabinetFinanceCsv,
  type ClientCabinetExportData,
} from './clientCabinetCsvExport';
import { downloadClientCabinetHtmlPackage, type ClientCabinetHtmlPackageData } from './clientCabinetHtmlPackage';
import { downloadClientCabinetPdfPackage, type ClientCabinetPdfPackageData } from './clientCabinetPdfPackage';

type ClientCabinetExportsProps = {
  accessToken: string;
  client: ClientSummary;
  filters: ClientCabinetFiltersValue;
  requests: ClientRequestSummary[];
  invoices: BillingInvoiceSummary[];
  charges: BillingChargeSummary[];
  serviceHistory: BillingServiceHistory | null;
};

export function ClientCabinetExports({
  accessToken,
  client,
  filters,
  requests,
  invoices,
  charges,
  serviceHistory,
}: ClientCabinetExportsProps) {
  const [isHtmlPackaging, setHtmlPackaging] = useState(false);
  const [isPdfPackaging, setPdfPackaging] = useState(false);
  const [message, setMessage] = useState('');
  const exportData: ClientCabinetExportData = { client, filters, requests, invoices, charges, serviceHistory };
  const htmlPackageData: ClientCabinetHtmlPackageData = { client, filters, requests, invoices };
  const pdfPackageData: ClientCabinetPdfPackageData = { client, filters, requests, invoices };
  const documentsCount = requests.length + invoices.length * 2;
  const financeRowsCount = charges.length + invoices.length + invoices.reduce((total, invoice) => total + invoice.payments.length, 0);

  async function downloadHtmlPackage() {
    setHtmlPackaging(true);
    setMessage('');

    try {
      const count = await downloadClientCabinetHtmlPackage(accessToken, htmlPackageData);
      setMessage(`HTML-пакет готов: ${count} документов.`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Не удалось подготовить HTML-пакет.');
    } finally {
      setHtmlPackaging(false);
    }
  }

  async function downloadPdfPackage() {
    setPdfPackaging(true);
    setMessage('');

    try {
      const count = await downloadClientCabinetPdfPackage(accessToken, pdfPackageData);
      setMessage(`PDF-пакет готов: ${count} документов.`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Не удалось подготовить PDF-пакет.');
    } finally {
      setPdfPackaging(false);
    }
  }

  return (
    <section className="client-cabinet-exports" aria-label="Выгрузки клиентского кабинета">
      <div className="client-cabinet-exports__title">
        <FileDown size={17} aria-hidden="true" />
        <div>
          <h3>Выгрузки</h3>
          <span>по текущим фильтрам</span>
        </div>
      </div>

      <div className="client-cabinet-exports__metrics" aria-label="Состав выгрузки">
        <span>{documentsCount} документов</span>
        <span>{financeRowsCount} финансовых строк</span>
      </div>

      <div className="client-cabinet-exports__actions">
        <button
          className="icon-text-button"
          type="button"
          onClick={() => downloadClientCabinetDocumentsCsv(exportData)}
          disabled={documentsCount === 0}
        >
          <FileDown size={15} aria-hidden="true" />
          <span>Документы CSV</span>
        </button>
        <button
          className="icon-text-button"
          type="button"
          onClick={() => void downloadHtmlPackage()}
          disabled={documentsCount === 0 || isHtmlPackaging}
        >
          <Files size={15} aria-hidden="true" />
          <span>{isHtmlPackaging ? 'Готовлю HTML' : 'Пакет HTML'}</span>
        </button>
        <button
          className="icon-text-button"
          type="button"
          onClick={() => void downloadPdfPackage()}
          disabled={documentsCount === 0 || isPdfPackaging}
        >
          <FileArchive size={15} aria-hidden="true" />
          <span>{isPdfPackaging ? 'Готовлю PDF' : 'Пакет PDF'}</span>
        </button>
        <button
          className="icon-text-button"
          type="button"
          onClick={() => downloadClientCabinetFinanceCsv(exportData)}
          disabled={financeRowsCount === 0}
        >
          <ReceiptText size={15} aria-hidden="true" />
          <span>Финансы CSV</span>
        </button>
      </div>

      {message ? <p className="inline-status client-cabinet-exports__message">{message}</p> : null}
    </section>
  );
}
