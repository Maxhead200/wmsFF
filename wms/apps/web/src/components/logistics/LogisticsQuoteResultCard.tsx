import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { LogisticsQuoteResult } from '../../lib/api';

type LogisticsQuoteResultCardProps = {
  result: LogisticsQuoteResult;
};

const moneyFormatter = new Intl.NumberFormat('ru-RU', {
  currency: 'RUB',
  maximumFractionDigits: 2,
  style: 'currency',
});

export function LogisticsQuoteResultCard({ result }: LogisticsQuoteResultCardProps) {
  const icon = result.requiresManualReview ? (
    <AlertTriangle size={18} aria-hidden="true" />
  ) : (
    <CheckCircle2 size={18} aria-hidden="true" />
  );

  return (
    <div className={result.requiresManualReview ? 'quote-result quote-result--manual' : 'quote-result'}>
      {icon}
      <div className="quote-result__content">
        <div className="quote-result__title">
          <strong>{result.requiresManualReview ? 'Нужна ручная проверка' : formatMoney(result.estimatedTotalRub)}</strong>
          <span>{result.tariffSet.name}</span>
        </div>

        <div className="quote-result__grid">
          <QuoteMetric label="Маршрут" value={`${result.route.origin} -> ${result.route.destination}`} />
          <QuoteMetric label="Расчет" value={result.input.boxes ? `${result.input.boxes} короб.` : `${result.input.pallets} паллет.`} />
          <QuoteMetric label="Ступень" value={result.tier.label} />
          <QuoteMetric label="Цена" value={formatMoney(result.tier.priceRub)} />
        </div>

        {result.note ? <p className="quote-note">{result.note}</p> : null}
      </div>
    </div>
  );
}

function QuoteMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="quote-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatMoney(value: number | null) {
  return value == null ? 'Без автосуммы' : moneyFormatter.format(value);
}
