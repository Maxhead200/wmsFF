import { FileDown, ReceiptText } from 'lucide-react';
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

type ClientCabinetExportsProps = {
  client: ClientSummary;
  filters: ClientCabinetFiltersValue;
  requests: ClientRequestSummary[];
  invoices: BillingInvoiceSummary[];
  charges: BillingChargeSummary[];
  serviceHistory: BillingServiceHistory | null;
};

export function ClientCabinetExports({
  client,
  filters,
  requests,
  invoices,
  charges,
  serviceHistory,
}: ClientCabinetExportsProps) {
  const exportData: ClientCabinetExportData = { client, filters, requests, invoices, charges, serviceHistory };
  const documentsCount = requests.length + invoices.length * 2;
  const financeRowsCount = charges.length + invoices.length + invoices.reduce((total, invoice) => total + invoice.payments.length, 0);

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
          onClick={() => downloadClientCabinetFinanceCsv(exportData)}
          disabled={financeRowsCount === 0}
        >
          <ReceiptText size={15} aria-hidden="true" />
          <span>Финансы CSV</span>
        </button>
      </div>
    </section>
  );
}
