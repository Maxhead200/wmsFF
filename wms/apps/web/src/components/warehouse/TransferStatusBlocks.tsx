import { CheckCircle2 } from 'lucide-react';
import type { StockBalance, TransferBetweenBoxesResult } from '../../lib/api';
import { stockStatusLabel } from '../client-cabinet/clientCabinetFormat';

type TransferPreviewProps = {
  balance: StockBalance;
  toBoxCode: string;
};

export function TransferPreview({ balance, toBoxCode }: TransferPreviewProps) {
  return (
    <div className="transfer-preview">
      <div>
        <span>SKU</span>
        <strong>{balance.sku.internalSku}</strong>
        <p>{balance.sku.name}</p>
      </div>
      <div>
        <span>Откуда</span>
        <strong>{balance.box?.code ?? '-'}</strong>
        <p>{balance.quantity} шт. доступно</p>
      </div>
      <div>
        <span>Куда</span>
        <strong>{toBoxCode.trim() || '-'}</strong>
        <p>{stockStatusLabel(balance.status)}</p>
      </div>
    </div>
  );
}

export function TransferResult({ result }: { result: TransferBetweenBoxesResult }) {
  return (
    <div className="transfer-result">
      <CheckCircle2 size={18} aria-hidden="true" />
      <div>
        <strong>{result.status === 'APPLIED' ? 'Перенос применен' : 'Операция уже была применена'}</strong>
        <span>
          {result.fromBox ?? '-'} {'->'} {result.toBox ?? '-'} · {result.quantity ?? 0} шт.
        </span>
      </div>
    </div>
  );
}
