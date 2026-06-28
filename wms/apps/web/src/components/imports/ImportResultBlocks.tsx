import type {
  LogisticsImportCommitResult,
  LogisticsImportDirection,
  LogisticsImportIssue,
  LogisticsImportPreview,
  StockImportCommitResult,
  StockImportIssue,
  StockImportPreview,
} from '../../lib/api';

type Metric = {
  label: string;
  value: string | number;
};

type ImportMetricGridProps = {
  metrics: Metric[];
};

export function ImportMetricGrid({ metrics }: ImportMetricGridProps) {
  return (
    <div className="import-metrics">
      {metrics.map((metric) => (
        <div className="import-metric" key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
        </div>
      ))}
    </div>
  );
}

export function StockPreviewResult({ preview }: { preview: StockImportPreview }) {
  return (
    <div className="import-result">
      <ImportMetricGrid
        metrics={[
          { label: 'Строк', value: preview.summary.rows },
          { label: 'Коробов', value: preview.summary.boxes },
          { label: 'Штрихкодов', value: preview.summary.barcodes },
          { label: 'Штук', value: preview.summary.totalQuantity },
        ]}
      />
      <ImportIssues issues={preview.issues} />
      <StockCatalogSuggestions suggestions={preview.suggestions ?? []} />
      <StockSampleTable preview={preview} />
    </div>
  );
}

export function StockCommitResultBlock({ result }: { result: StockImportCommitResult }) {
  return (
    <div className="import-result">
      <div className="import-result__title">
        <h3>Остатки загружены</h3>
        <span>{result.sourceDocument}</span>
      </div>
      <ImportMetricGrid
        metrics={[
          { label: 'Короба', value: result.result.boxesTouched },
          { label: 'SKU', value: result.result.skusTouched },
          { label: 'Движения', value: result.result.movementsCreated },
          { label: 'Балансы', value: result.result.balancesTouched },
        ]}
      />
      <StockCatalogSuggestions suggestions={result.suggestions ?? []} />
      <ImportIssues issues={result.warnings} emptyText="Предупреждений нет." />
    </div>
  );
}

function StockCatalogSuggestions({ suggestions }: { suggestions: StockImportPreview['suggestions'] }) {
  if (!suggestions?.length) {
    return null;
  }

  return (
    <div className="import-suggestions">
      {suggestions.slice(0, 12).map((suggestion) => (
        <article className={suggestion.applied ? 'import-suggestion import-suggestion--applied' : 'import-suggestion'} key={`${suggestion.row}-${suggestion.message}`}>
          <div>
            <strong>
              Строка {suggestion.row}: {suggestion.title}
            </strong>
            <span>{suggestion.message}</span>
          </div>
          <span className={suggestion.applied ? 'status status--done' : 'status status--planned'}>
            {suggestion.applied ? 'Подставлено' : 'Нужно действие'}
          </span>
        </article>
      ))}
    </div>
  );
}

export function LogisticsPreviewResult({ preview }: { preview: LogisticsImportPreview }) {
  return (
    <div className="import-result">
      <ImportMetricGrid
        metrics={[
          { label: 'Направлений', value: preview.directionsCount },
          { label: 'Ступеней', value: preview.directions.reduce((sum, direction) => sum + direction.tiers.length, 0) },
          { label: 'Ошибок', value: preview.issues.length },
        ]}
      />
      <ImportIssues issues={preview.issues} />
      {preview.note ? <p className="import-note">{preview.note}</p> : null}
      <div className="direction-list">
        {preview.directions.slice(0, 8).map((direction) => (
          <DirectionItem direction={direction} key={`${direction.origin}-${direction.destination}`} />
        ))}
      </div>
    </div>
  );
}

export function LogisticsCommitResultBlock({ result }: { result: LogisticsImportCommitResult }) {
  return (
    <div className="import-result">
      <div className="import-result__title">
        <h3>Тарифы загружены</h3>
        <span>{result.sourceFile ?? result.name}</span>
      </div>
      <ImportMetricGrid
        metrics={[
          { label: 'Набор', value: result.name },
          { label: 'Направлений', value: result.directionsCount },
          { label: 'Ступеней', value: result.tiersCount },
        ]}
      />
    </div>
  );
}

function StockSampleTable({ preview }: { preview: StockImportPreview }) {
  if (preview.sample.length === 0) {
    return null;
  }

  return (
    <div className="import-table-wrap">
      <table className="import-table">
        <thead>
          <tr>
            <th>Строка</th>
            <th>Короб</th>
            <th>Штрихкод</th>
            <th>Наименование</th>
            <th>Кол-во</th>
          </tr>
        </thead>
        <tbody>
          {preview.sample.map((item) => (
            <tr key={`${item.sourceRow}-${item.boxCode}-${item.barcode}`}>
              <td>{item.sourceRow}</td>
              <td>{item.boxCode}</td>
              <td>{item.barcode}</td>
              <td>
                <strong>{item.name}</strong>
                <span>{[item.color, item.size].filter(Boolean).join(' / ') || 'без параметров'}</span>
              </td>
              <td>{item.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImportIssues({
  issues,
  emptyText,
}: {
  issues: Array<StockImportIssue | LogisticsImportIssue>;
  emptyText?: string;
}) {
  if (issues.length === 0) {
    return emptyText ? <p className="import-empty">{emptyText}</p> : null;
  }

  return (
    <div className="import-issues">
      {issues.slice(0, 10).map((issue) => (
        <p className={issueSeverity(issue) === 'error' ? 'issue issue--error' : 'issue'} key={`${issue.row}-${issue.message}`}>
          <span>Строка {issue.row}</span>
          {issue.message}
        </p>
      ))}
    </div>
  );
}

function DirectionItem({ direction }: { direction: LogisticsImportDirection }) {
  return (
    <article className="direction-item">
      <div>
        <strong>{direction.destination}</strong>
        <span>{direction.origin}</span>
      </div>
      <span className="status status--planned">{direction.pricingMode}</span>
      <p>{direction.tiers.length} ступ.</p>
    </article>
  );
}

function issueSeverity(issue: StockImportIssue | LogisticsImportIssue) {
  return 'severity' in issue ? issue.severity : 'error';
}
