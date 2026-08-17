import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BILLING_SELLER } from '../billing/billing-printing';
import { UpsertOwnCompanyDto } from './dto/upsert-own-company.dto';

const companyInclude = {
  bankAccounts: {
    orderBy: [{ isDefault: 'desc' as const }, { createdAt: 'asc' as const }],
  },
};

@Injectable()
export class OwnCompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    await this.ensureDefaultCompany();
    return (this.prisma as any).ownCompany.findMany({
      include: companyInclude,
      orderBy: [{ isDefault: 'desc' }, { shortName: 'asc' }],
    });
  }

  async create(dto: UpsertOwnCompanyDto) {
    return this.prisma.$transaction(async (tx) => {
      const shouldBeDefault = dto.isDefault ?? ((await (tx as any).ownCompany.count()) === 0);
      if (shouldBeDefault) {
        await (tx as any).ownCompany.updateMany({ data: { isDefault: false } });
      }

      return (tx as any).ownCompany.create({
        data: this.companyData(dto, shouldBeDefault),
        include: companyInclude,
      });
    });
  }

  async update(id: string, dto: UpsertOwnCompanyDto) {
    const company = await this.findOrThrow(id);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await (tx as any).ownCompany.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
      }

      await (tx as any).ownCompanyBankAccount.deleteMany({ where: { companyId: id } });

      return (tx as any).ownCompany.update({
        where: { id },
        data: this.companyData(dto, dto.isDefault ?? company.isDefault),
        include: companyInclude,
      });
    });
  }

  async findDefaultSeller() {
    await this.ensureDefaultCompany();
    const company = await (this.prisma as any).ownCompany.findFirst({
      where: { isDefault: true, isActive: true },
      include: companyInclude,
      orderBy: { updatedAt: 'desc' },
    });

    return company ? ownCompanyToSeller(company) : BILLING_SELLER;
  }

  private async findOrThrow(id: string) {
    const company = await (this.prisma as any).ownCompany.findUnique({ where: { id } });
    if (!company) {
      throw new NotFoundException('Собственная компания не найдена.');
    }
    return company;
  }

  private async ensureDefaultCompany() {
    if (!(this.prisma as any).ownCompany) {
      return;
    }

    const count = await (this.prisma as any).ownCompany.count();
    if (count > 0) {
      return;
    }

    await (this.prisma as any).ownCompany.create({
      data: {
        shortName: BILLING_SELLER.shortName,
        fullName: BILLING_SELLER.fullName,
        inn: BILLING_SELLER.inn,
        kpp: BILLING_SELLER.kpp || null,
        legalAddress: BILLING_SELLER.address || null,
        bankName: BILLING_SELLER.bankName,
        bankBik: BILLING_SELLER.bankBik,
        bankAccount: BILLING_SELLER.bankAccount,
        correspondentAccount: BILLING_SELLER.correspondentAccount,
        paymentCode: BILLING_SELLER.paymentCode,
        paymentPurposeCode: BILLING_SELLER.paymentPurposeCode,
        isDefault: true,
        bankAccounts: {
          create: [
            {
              bankName: BILLING_SELLER.bankName,
              bankBik: BILLING_SELLER.bankBik,
              bankAccount: BILLING_SELLER.bankAccount,
              correspondentAccount: BILLING_SELLER.correspondentAccount,
              isDefault: true,
            },
          ],
        },
      },
    });
  }

  private companyData(dto: UpsertOwnCompanyDto, isDefault?: boolean) {
    const defaultAccount = dto.bankAccounts?.find((account) => account.isDefault) ?? dto.bankAccounts?.[0];
    return {
      shortName: dto.shortName.trim(),
      fullName: dto.fullName.trim(),
      inn: dto.inn.trim(),
      kpp: trimOrNull(dto.kpp),
      ogrn: trimOrNull(dto.ogrn),
      legalAddress: trimOrNull(dto.legalAddress),
      bankName: trimOrNull(defaultAccount?.bankName ?? dto.bankName),
      bankBik: trimOrNull(defaultAccount?.bankBik ?? dto.bankBik),
      bankAccount: trimOrNull(defaultAccount?.bankAccount ?? dto.bankAccount),
      correspondentAccount: trimOrNull(defaultAccount?.correspondentAccount ?? dto.correspondentAccount),
      paymentCode: trimOrNull(dto.paymentCode),
      paymentPurposeCode: trimOrNull(dto.paymentPurposeCode),
      isDefault: Boolean(isDefault),
      isActive: dto.isActive ?? true,
      comment: trimOrNull(dto.comment),
      bankAccounts: dto.bankAccounts
        ? {
            create: dto.bankAccounts.map((account, index) => ({
              bankName: account.bankName.trim(),
              bankBik: account.bankBik.trim(),
              bankAccount: account.bankAccount.trim(),
              correspondentAccount: trimOrNull(account.correspondentAccount),
              isDefault: account.isDefault ?? index === 0,
              comment: trimOrNull(account.comment),
            })),
          }
        : undefined,
    };
  }
}

export function ownCompanyToSeller(company: any) {
  const account = company.bankAccounts?.find((item: any) => item.isDefault) ?? company.bankAccounts?.[0];
  return {
    shortName: company.shortName,
    fullName: company.fullName,
    inn: company.inn,
    kpp: company.kpp ?? '',
    address: company.legalAddress ?? '',
    bankName: account?.bankName ?? company.bankName ?? '',
    bankBik: account?.bankBik ?? company.bankBik ?? '',
    bankAccount: account?.bankAccount ?? company.bankAccount ?? '',
    correspondentAccount: account?.correspondentAccount ?? company.correspondentAccount ?? '',
    paymentCode: company.paymentCode ?? '',
    paymentPurposeCode: company.paymentPurposeCode ?? '',
  };
}

function trimOrNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
