import { AlertTriangle, X } from 'lucide-react';
import './confirm-dialog.css';

type ConfirmDialogProps = {
  title: string;
  message: string;
  details?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  isBusy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  title,
  message,
  details = [],
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  isBusy = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <div className="confirm-dialog-backdrop" role="presentation">
      <section aria-labelledby="confirm-dialog-title" aria-modal="true" className="confirm-dialog" role="dialog">
        <header className="confirm-dialog__header">
          <span className="confirm-dialog__icon">
            <AlertTriangle size={22} aria-hidden="true" />
          </span>
          <div>
            <h3 id="confirm-dialog-title">{title}</h3>
            <p>{message}</p>
          </div>
          <button className="icon-button" type="button" onClick={onCancel} aria-label="Закрыть" disabled={isBusy}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {details.length > 0 ? (
          <ul className="confirm-dialog__details">
            {details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        ) : null}

        <footer className="confirm-dialog__actions">
          <button className="primary-button confirm-dialog__secondary" type="button" onClick={onCancel} disabled={isBusy}>
            {cancelLabel}
          </button>
          <button className="primary-button" type="button" onClick={onConfirm} disabled={isBusy}>
            {isBusy ? 'Сохранение' : confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
