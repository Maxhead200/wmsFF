import { Bell, BellRing, CheckCheck, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type {
  ClientNotificationEvent,
  ClientNotificationPreferenceSummary,
  ClientNotificationSummary,
} from '../../lib/api';
import { formatCabinetDate } from './clientCabinetFormat';

export type BrowserNotificationPermission = NotificationPermission | 'unsupported';

type ClientCabinetNotificationsProps = {
  notifications: ClientNotificationSummary[];
  preferences: ClientNotificationPreferenceSummary[];
  browserNotificationPermission: BrowserNotificationPermission;
  onEnableBrowserNotifications: () => void;
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
    title: 'Срок годности',
    caption: 'Товары со сроком годности под контролем',
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
  browserNotificationPermission,
  onEnableBrowserNotifications,
  onMarkRead,
  onTogglePreference,
}: ClientCabinetNotificationsProps) {
  const [showRead, setShowRead] = useState(false);
  const unreadNotifications = notifications.filter((notification) => !notification.isRead);
  const readNotifications = notifications.filter((notification) => notification.isRead);
  const orderedPreferences = preferenceOrder
    .map((eventType) => preferences.find((preference) => preference.eventType === eventType))
    .filter(Boolean) as ClientNotificationPreferenceSummary[];

  return (
    <section className="client-cabinet-notifications" aria-label="Уведомления клиента">
      <div className="client-cabinet-section__heading client-cabinet-notifications__heading">
        <div>
          <h3>Уведомления</h3>
          <span className="status status--planned">{unreadNotifications.length} новых</span>
        </div>
        <BrowserNotificationButton
          permission={browserNotificationPermission}
          onEnable={onEnableBrowserNotifications}
        />
      </div>

      {orderedPreferences.length > 0 ? (
        <div className="client-notification-preferences" aria-label="Настройки уведомлений">
          {orderedPreferences.map((preference) => {
            const label = preferenceLabels[preference.eventType] ?? {
              title: preference.eventType,
              caption: 'Уведомление клиента',
            };

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

      {unreadNotifications.length === 0 ? (
        <p className="panel-message">Новых уведомлений нет.</p>
      ) : (
        <NotificationList notifications={unreadNotifications} onMarkRead={onMarkRead} />
      )}

      {readNotifications.length > 0 ? (
        <div className="client-cabinet-read-notifications">
          <button
            className="icon-text-button client-cabinet-read-notifications__toggle"
            type="button"
            onClick={() => setShowRead((current) => !current)}
            aria-expanded={showRead}
          >
            <ChevronDown size={16} aria-hidden="true" />
            <span>{showRead ? 'Свернуть прочитанные' : `Показать прочитанные (${readNotifications.length})`}</span>
          </button>
          {showRead ? <NotificationList notifications={readNotifications} onMarkRead={onMarkRead} /> : null}
        </div>
      ) : null}
    </section>
  );
}

function BrowserNotificationButton({
  permission,
  onEnable,
}: {
  permission: BrowserNotificationPermission;
  onEnable: () => void;
}) {
  if (permission === 'granted') {
    return (
      <span className="status status--ready">
        <BellRing size={14} aria-hidden="true" />
        Браузер включен
      </span>
    );
  }

  if (permission === 'unsupported') {
    return <span className="status status--planned">Браузер не поддерживает popup</span>;
  }

  if (permission === 'denied') {
    return <span className="status status--planned">Разрешите уведомления в браузере</span>;
  }

  return (
    <button className="icon-text-button" type="button" onClick={onEnable}>
      <BellRing size={15} aria-hidden="true" />
      <span>Включить popup</span>
    </button>
  );
}

function NotificationList({
  notifications,
  onMarkRead,
}: {
  notifications: ClientNotificationSummary[];
  onMarkRead: (notification: ClientNotificationSummary) => void;
}) {
  return (
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
  );
}
