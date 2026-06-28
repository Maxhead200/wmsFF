import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingInvoiceStatus, ClientRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const TELEGRAM_SETTINGS_KEY = 'TELEGRAM_NOTIFICATIONS';

export type TelegramNotificationSettings = {
  enabled: boolean;
  fulfillmentChatIds: string;
  hasBotToken: boolean;
  updatedAt: Date | null;
};

type StoredTelegramSettings = {
  enabled?: boolean;
  botToken?: string;
  fulfillmentChatIds?: string;
};

@Injectable()
export class TelegramNotificationsService {
  private readonly logger = new Logger(TelegramNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getPublicSettings(): Promise<TelegramNotificationSettings> {
    const { setting, payload, botToken } = await this.loadSettings();
    return {
      enabled: payload.enabled === true,
      fulfillmentChatIds: payload.fulfillmentChatIds ?? '',
      hasBotToken: Boolean(botToken),
      updatedAt: setting?.updatedAt ?? null,
    };
  }

  async updateSettings(dto: { enabled?: boolean; botToken?: string; fulfillmentChatIds?: string }, userId?: string) {
    const current = await this.loadSettings();
    const nextPayload: StoredTelegramSettings = {
      enabled: dto.enabled === true,
      botToken: dto.botToken?.trim() || current.payload.botToken,
      fulfillmentChatIds: dto.fulfillmentChatIds?.trim() ?? current.payload.fulfillmentChatIds ?? '',
    };

    const setting = await this.prisma.systemSetting.upsert({
      where: { key: TELEGRAM_SETTINGS_KEY },
      update: {
        value: nextPayload,
        updatedByUserId: userId,
      },
      create: {
        key: TELEGRAM_SETTINGS_KEY,
        value: nextPayload,
        updatedByUserId: userId,
      },
    });

    return {
      enabled: nextPayload.enabled === true,
      fulfillmentChatIds: nextPayload.fulfillmentChatIds ?? '',
      hasBotToken: Boolean(nextPayload.botToken || this.config.get<string>('TELEGRAM_BOT_TOKEN')),
      updatedAt: setting.updatedAt,
    };
  }

  async sendTestMessage(chatId: string, message: string) {
    return this.sendText(chatId, message);
  }

  async notifyFulfillmentNewRequest(requestId: string) {
    const settings = await this.loadSettings();
    if (!this.canSend(settings.payload)) {
      return;
    }

    const request = await this.prisma.clientRequest.findUnique({
      where: { id: requestId },
      include: {
        client: { select: { name: true } },
        items: { select: { quantity: true } },
      },
    });
    if (!request) {
      return;
    }

    const text = [
      'Новая заявка клиента',
      `Клиент: ${request.client.name}`,
      `Заявка: ${request.title}`,
      `Город: ${request.destinationCity || '-'}`,
      `Статус: ${requestStatusLabel(request.status)}`,
      `Позиций: ${request.items.length}`,
      `Количество: ${request.items.reduce((sum, item) => sum + item.quantity, 0)}`,
    ].join('\n');

    await this.sendToMany(settings.payload.fulfillmentChatIds, text);
  }

  async notifyClientRequestStatus(requestId: string, statusFrom: ClientRequestStatus | null, statusTo: ClientRequestStatus) {
    const settings = await this.loadSettings();
    if (!this.canSend(settings.payload)) {
      return;
    }

    const request = await this.prisma.clientRequest.findUnique({
      where: { id: requestId },
      include: { client: { select: { telegramChatId: true } } },
    });
    const chatId = request?.client.telegramChatId?.trim();
    if (!request || !chatId) {
      return;
    }

    const text = [
      `Статус заявки изменен`,
      `Заявка: ${request.title}`,
      `Город: ${request.destinationCity || '-'}`,
      `Статус: ${statusFrom ? `${requestStatusLabel(statusFrom)} -> ` : ''}${requestStatusLabel(statusTo)}`,
    ].join('\n');

    await this.sendText(chatId, text);
  }

  async notifyClientInvoiceStatus(invoiceId: string, statusFrom: BillingInvoiceStatus | null, statusTo: BillingInvoiceStatus) {
    const settings = await this.loadSettings();
    if (!this.canSend(settings.payload)) {
      return;
    }

    const invoice = await this.prisma.billingInvoice.findUnique({
      where: { id: invoiceId },
      include: { client: { select: { telegramChatId: true } } },
    });
    const chatId = invoice?.client.telegramChatId?.trim();
    if (!invoice || !chatId) {
      return;
    }

    const text = [
      `Счет № ${invoice.number}`,
      statusTo === BillingInvoiceStatus.ISSUED ? 'Вам выставлен счет.' : `Статус счета: ${billingInvoiceStatusLabel(statusTo)}`,
      statusFrom && statusFrom !== statusTo ? `Было: ${billingInvoiceStatusLabel(statusFrom)}` : '',
      `Сумма: ${formatRub(Number(invoice.totalRub))} руб.`,
    ].filter(Boolean).join('\n');

    await this.sendText(chatId, text);
  }

  private async sendToMany(chatIdsText: string | undefined, text: string) {
    const chatIds = splitChatIds(chatIdsText);
    await Promise.all(chatIds.map((chatId) => this.sendText(chatId, text)));
  }

  private async sendText(chatId: string, text: string) {
    const { payload, botToken } = await this.loadSettings();
    if (!this.canSend(payload) || !botToken || !chatId.trim()) {
      return { ok: false, skipped: true };
    }

    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId.trim(),
          text,
          disable_web_page_preview: true,
        }),
      });
      if (!response.ok) {
        this.logger.warn(`Telegram send failed: HTTP ${response.status}`);
        return { ok: false, status: response.status };
      }
      return { ok: true };
    } catch (caught) {
      this.logger.warn(`Telegram send failed: ${caught instanceof Error ? caught.message : String(caught)}`);
      return { ok: false };
    }
  }

  private canSend(payload: StoredTelegramSettings) {
    return payload.enabled === true;
  }

  private async loadSettings() {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key: TELEGRAM_SETTINGS_KEY } });
    const value = setting?.value;
    const payload = value && typeof value === 'object' && !Array.isArray(value) ? (value as StoredTelegramSettings) : {};
    const botToken = payload.botToken?.trim() || this.config.get<string>('TELEGRAM_BOT_TOKEN')?.trim() || '';
    return { setting, payload, botToken };
  }
}

function splitChatIds(value: string | undefined) {
  return (value ?? '')
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function requestStatusLabel(status: ClientRequestStatus) {
  const labels: Record<ClientRequestStatus, string> = {
    SUBMITTED: 'создана',
    IN_REVIEW: 'на проверке',
    APPROVED: 'согласована',
    IN_WORK: 'в работе',
    PACKED: 'готова к отгрузке',
    DONE: 'отгружена',
    CANCELLED: 'отменена',
    REJECTED: 'отклонена',
  };
  return labels[status];
}

function billingInvoiceStatusLabel(status: BillingInvoiceStatus) {
  const labels: Record<BillingInvoiceStatus, string> = {
    DRAFT: 'черновик',
    ISSUED: 'выставлен',
    PAID: 'оплачен',
    CANCELLED: 'отменен',
  };
  return labels[status];
}

function formatRub(value: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value);
}
