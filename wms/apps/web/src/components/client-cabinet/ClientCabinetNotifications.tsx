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
  onMarkRead: (notification: ClientNotificationSummary) => void;
  onTogglePreference: (preference: ClientNotificationPreferenceSummary, isEnabled: boolean) => void;
};

const preferenceLabels: Record<ClientNotificationEvent, { title: string; caption: string }> = {
  REQUEST_COMMENT: {
    title: 'Комментарии',
    caption: 'Новые внешние комментарии по заявкам',
  },
  REQUEST_STATUS_CHANGED: {
    title: 'Статусы',
    caption: 'Изменения статуса заявок',
  },
  REQUEST_FILE_UPLOADED: {
    title: 'Файлы',
    caption: 'Новые вложения в заявках',
  },
  MANUAL: {
    title: 'Ручные',
    caption: 'Сообщения от менеджера',
  },
};

const preferenceOrder: ClientNotificationEvent[] = [
  'REQUEST_COMMENT',
  'REQUEST_STATUS_CHANGED',
  'REQUEST_FILE_UPLOADED',
  'MANUAL',
];

export function ClientCabinetNotifications({
  notifications,
  preferences,
  onMarkRead,
  onTogglePreference,
}: ClientCabinetNotificationsProps) {
  const unreadCount = notifications.filter((notification) => !notification.isRead).length;
  const orderedPreferences = preferenceOrder
    .map((eventType) => preferences.find((preference) => preference.eventType === eventType))
    .filter(Boolean) as ClientNotificationPreferenceSummary[];

  return (
    <section className="client-cabinet-notifications" aria-label="Уведомления клиента">
      <div className="client-cabinet-section__heading">
        <h3>Уведомления</h3>
        <span className="status status--planned">{unreadCount} новых</span>
      </div>

      {orderedPreferences.length > 0 ? (
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
