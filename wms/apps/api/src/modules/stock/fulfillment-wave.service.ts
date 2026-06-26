import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ClientRequestStatus,
  ClientRequestType,
  PickWaveRequestStatus,
  PickWaveStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ClientScopeService } from '../auth/client-scope.service';
import { CreatePickWaveDto } from './dto/create-pick-wave.dto';
import { ListPickWavesDto } from './dto/list-pick-waves.dto';
import { RunPickWaveDto } from './dto/run-pick-wave.dto';
import { pickWaveInclude } from './pick-wave.include';
import { StockOperationsService } from './stock-operations.service';

const pickWaveRequestStatuses: ClientRequestStatus[] = [
  ClientRequestStatus.SUBMITTED,
  ClientRequestStatus.IN_REVIEW,
  ClientRequestStatus.APPROVED,
];

@Injectable()
export class FulfillmentWaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientScopes: ClientScopeService,
    private readonly operations: StockOperationsService,
  ) {}

  listWaves(query: ListPickWavesDto, user: AuthUser) {
    return this.prisma.pickWave.findMany({
      where: {
        status: query.status,
        requests: {
          some: {
            request: {
              clientId: this.clientScopes.resolveClientFilter(user),
            },
          },
        },
      },
      include: pickWaveInclude,
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
  }

  async createWave(dto: CreatePickWaveDto, user: AuthUser) {
    const requestIds = [...new Set(dto.requestIds.map((id) => id.trim()).filter(Boolean))];
    if (requestIds.length === 0) {
      throw new BadRequestException('Для волны сборки нужна хотя бы одна заявка.');
    }

    const requests = await this.prisma.clientRequest.findMany({
      where: { id: { in: requestIds } },
      include: { items: true },
    });
    if (requests.length !== requestIds.length) {
      throw new NotFoundException('Одна или несколько заявок для волны не найдены.');
    }

    const busyLinks = await this.prisma.pickWaveRequest.findMany({
      where: {
        requestId: { in: requestIds },
        wave: { status: { notIn: [PickWaveStatus.CANCELLED, PickWaveStatus.DONE] } },
      },
      include: { wave: true },
    });
    if (busyLinks.length > 0) {
      throw new BadRequestException('Одна или несколько заявок уже входят в активную волну сборки.');
    }

    for (const request of requests) {
      this.clientScopes.requireClientAccess(user, request.clientId, 'write');
      if (request.type !== ClientRequestType.OUTBOUND) {
        throw new BadRequestException('В волну сборки можно добавлять только outbound-заявки.');
      }
      if (!pickWaveRequestStatuses.includes(request.status)) {
        throw new BadRequestException('В волну сборки можно добавлять только новые, проверяемые или согласованные заявки.');
      }
      if (request.items.length === 0) {
        throw new BadRequestException('В заявке нет товарных позиций для сборки.');
      }
    }

    return this.prisma.pickWave.create({
      data: {
        waveNumber: this.nextWaveNumber(),
        status: PickWaveStatus.PLANNED,
        comment: dto.comment?.trim() || undefined,
        createdByUserId: user.id,
        requests: {
          create: requestIds.map((requestId) => ({ requestId })),
        },
      },
      include: pickWaveInclude,
    });
  }

  async runWave(waveId: string, dto: RunPickWaveDto, user: AuthUser) {
    const wave = await this.prisma.pickWave.findUnique({
      where: { id: waveId },
      include: pickWaveInclude,
    });
    if (!wave) {
      throw new NotFoundException('Волна сборки не найдена.');
    }
    if (wave.status === PickWaveStatus.CANCELLED) {
      throw new BadRequestException('Отмененную волну сборки нельзя запускать.');
    }
    if (wave.status === PickWaveStatus.DONE) {
      throw new BadRequestException('Волна сборки уже завершена.');
    }

    await this.prisma.pickWave.update({
      where: { id: wave.id },
      data: { status: PickWaveStatus.PICKING },
    });

    const runResults = [];
    let failedCount = 0;

    for (const waveRequest of wave.requests) {
      if (waveRequest.status === PickWaveRequestStatus.PICKED) {
        runResults.push({
          requestId: waveRequest.requestId,
          status: 'SKIPPED_ALREADY_PICKED',
        });
        continue;
      }

      try {
        // Русский комментарий: волна использует уже существующий idempotent pick-request,
        // поэтому повтор запуска не дублирует движения stock ledger.
        const result = await this.operations.pickClientRequest(
          {
            requestId: waveRequest.requestId,
            idempotencyKey: `${dto.idempotencyKey ?? `wave-pick:${wave.id}`}:${waveRequest.requestId}`,
            comment: dto.comment?.trim() || `Волна сборки ${wave.waveNumber}`,
          },
          user,
        );
        await this.prisma.pickWaveRequest.update({
          where: { waveId_requestId: { waveId: wave.id, requestId: waveRequest.requestId } },
          data: {
            status: PickWaveRequestStatus.PICKED,
            pickedAt: new Date(),
            result: this.toJson(result),
          },
        });
        runResults.push({
          requestId: waveRequest.requestId,
          status: result.status,
        });
      } catch (caught) {
        failedCount += 1;
        const message = caught instanceof Error ? caught.message : 'Не удалось собрать заявку в волне.';
        await this.prisma.pickWaveRequest.update({
          where: { waveId_requestId: { waveId: wave.id, requestId: waveRequest.requestId } },
          data: {
            status: PickWaveRequestStatus.FAILED,
            result: { message },
          },
        });
        runResults.push({
          requestId: waveRequest.requestId,
          status: 'FAILED',
          message,
        });
      }
    }

    const status = failedCount > 0 ? PickWaveStatus.FAILED : PickWaveStatus.DONE;
    const updatedWave = await this.prisma.pickWave.update({
      where: { id: wave.id },
      data: { status },
      include: pickWaveInclude,
    });

    return {
      wave: updatedWave,
      results: runResults,
    };
  }

  private nextWaveNumber() {
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `WAVE-${stamp}-${suffix}`;
  }

  private toJson(value: unknown) {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
