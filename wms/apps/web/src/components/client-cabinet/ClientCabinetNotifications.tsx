import { Bell, CheckCheck } from 'lucide-react';
import type { ClientNotificationSummary } from '../../lib/api';
import { formatCabinetDate } from './clientCabinetFormat';

type ClientCabinetNotificationsProps = {
  notifications: ClientNotificationSummary[];
  onMarkRead: (notification: ClientNotificationSummary) => void;
};

export function ClientCabinetNotifications({ notifications, onMarkRead }: ClientCabinetNotificationsProps) {
  const unreadCount = notifications.filter((notification) => !notification.isRead).length;

  return (
    <section className="client-cabinet-notifications" aria-label="Уведомления клиента">
      <div className="client-cabinet-section__heading">
        <h3>Уведомления</h3>
        <span className="status status--planned">{unreadCount} новых</span>
      </div>

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
