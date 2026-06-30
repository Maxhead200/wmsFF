import { Bell, CheckCheck } from 'lucide-react';
import type {
  ClientNotificationEvent,
  ClientNotificationPreferenceSummary,
  ClientNotificationSummary,
} from '../../lib/api';
import { formatCabinetDate } from './clientCabinetFormat';

type ClientCabinetNotificationsProps = {
  notifications: ClientNotificationSummary[];
  preferences: ClientNotificationPreferenceSummary[];
  showPreferences?: boolean;
  onMarkRead: (notification: ClientNotificationSummary) => void;
  onTogglePreference: (preference: ClientNotificationPreferenceSummary, isEnabled: boolean) => void;
};

const preferenceLabels: Record<ClientNotificationEvent, { title: string; caption: string }> = {
  REQUEST_STATUS_CHANGED: {
    title: 'Заявки',
    caption: 'Статусы и ход обработки заявок',
  },
  REQUEST_FILE_UPLOADED: {
    title: 'Файлы',
    caption: 'Новые вложения в заявках',
  },
  REQUEST_COMMENT: {
    title: 'Комментарии',
    caption: 'Внешние комментарии по заявкам',
  },
  BILLING_INVOICE_STATUS_CHANGED: {
    title: 'Счета',
    caption: 'Изменения статуса счетов',
  },
  BILLING_PAYMENT_RECORDED: {
    title: 'Оплаты',
    caption: 'Поступления по счетам',
  },
  LOGISTICS_DELIVERY_STATUS_CHANGED: {
    title: 'Доставка',
    caption: 'Статусы доставок и рейсов',
  },
  SKU_EXPIRATION: {
    title: 'Сроки годности',
    caption: 'Товары, у которых срок годности истек или скоро закончится',
  },
  MANUAL: {
    title: 'Сообщения',
    caption: 'Сообщения от менеджера',
  },
};

const preferenceOrder: ClientNotificationEvent[] = [
  'REQUEST_STATUS_CHANGED',
  'REQUEST_FILE_UPLOADED',
  'REQUEST_COMMENT',
  'BILLING_INVOICE_STATUS_CHANGED',
  'BILLING_PAYMENT_RECORDED',
  'LOGISTICS_DELIVERY_STATUS_CHANGED',
  'SKU_EXPIRATION',
  'MANUAL',
];

export function ClientCabinetNotifications({
  notifications,
  preferences,
  showPreferences = true,
  onMarkRead,
  onTogglePreference,
}: ClientCabinetNotificationsProps) {
  const unreadCount = notifications.filter((notification) => !notification.isRead).length;

  return (
    <section className="client-cabinet-notifications" aria-label="Уведомления клиента">
      <div className="client-cabinet-section__heading">
        <h3>Уведомления</h3>
        <span className="status status--planned">{unreadCount} новых</span>
      </div>

      {showPreferences ? (
        <ClientNotificationPreferences preferences={preferences} onTogglePreference={onTogglePreference} />
      ) : null}

      {notifications.length === 0 ? (
        <p className="panel-message">Уведомлений пока нет.</p>
      ) : (
        <div className="client-cabinet-notification-list">
          {notifications.map((notification) => (
            <article
              className={`client-cabinet-notification client-cabinet-notification--${notification.severity.toLowerCase()}`}
              key={notification.id}
            >
              <Bell size={18} aria-hidden="true" />
              <div>
                <strong>{notification.title}</strong>
                {notification.body ? <span>{notification.body}</span> : null}
                <small>
                  {formatCabinetDate(notification.createdAt)}
                  {notification.request ? ` · ${notification.request.title}` : ''}
                </small>
              </div>
              {!notification.isRead ? (
                <button
                  className="icon-text-button"
                  type="button"
                  onClick={() => onMarkRead(notification)}
                  title="Отметить уведомление прочитанным"
                >
                  <CheckCheck size={15} aria-hidden="true" />
                  <span>Прочитано</span>
                </button>
              ) : (
                <span className="status status--ready">прочитано</span>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function ClientNotificationPreferences({
  preferences,
  onTogglePreference,
}: {
  preferences: ClientNotificationPreferenceSummary[];
  onTogglePreference: (preference: ClientNotificationPreferenceSummary, isEnabled: boolean) => void;
}) {
  const orderedPreferences = preferenceOrder
    .map((eventType) => preferences.find((preference) => preference.eventType === eventType))
    .filter(Boolean) as ClientNotificationPreferenceSummary[];

  if (orderedPreferences.length === 0) {
    return <p className="panel-message">Настройки уведомлений пока не созданы.</p>;
  }

  return (
    <div className="client-notification-preferences" aria-label="Настройки уведомлений">
      {orderedPreferences.map((preference) => {
        const label = preferenceLabels[preference.eventType];

        return (
          <label className="client-notification-preference" key={`${preference.clientId}-${preference.eventType}`}>
            <input
              type="checkbox"
              checked={preference.isEnabled}
              onChange={(event) => onTogglePreference(preference, event.target.checked)}
            />
            <span>
              <strong>{label.title}</strong>
              <small>{label.caption}</small>
            </span>
          </label>
        );
      })}
    </div>
  );
}
