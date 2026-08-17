import { Injectable } from '@nestjs/common';

export type BoxLabelInput = {
  boxCode: string;
  clientName: string;
  quantity?: number;
};

export type SkuLabelInput = {
  skuCode: string;
  name: string;
  barcode?: string;
  clientName?: string;
  article?: string;
  color?: string;
  size?: string;
};

export type PalletLabelInput = {
  palletCode: string;
  clientName: string;
  zoneCode?: string;
  boxesCount?: number;
};

@Injectable()
export class TsplLabelService {
  boxLabel(input: BoxLabelInput) {
    const safeClient = sanitizeTsplText(input.clientName);
    const safeBox = sanitizeTsplText(input.boxCode);

    // Русский комментарий: TSPL-команда пока фиксированная; редактор шаблонов появится отдельным модулем.
    return [
      'SIZE 80 mm,50 mm',
      'GAP 2 mm,0',
      'CLS',
      `TEXT 40,35,"3",0,1,1,"${safeClient}"`,
      `BARCODE 40,95,"128",90,1,0,2,2,"${safeBox}"`,
      `TEXT 40,205,"3",0,1,1,"Короб: ${safeBox}"`,
      `TEXT 40,255,"2",0,1,1,"Кол-во строк: ${input.quantity ?? 0}"`,
      'PRINT 1',
    ].join('\n');
  }

  skuLabel(input: SkuLabelInput) {
    const safeClient = sanitizeTsplText(input.clientName ?? '');
    const safeSku = sanitizeTsplText(input.skuCode);
    const safeBarcode = sanitizeTsplText(input.barcode || input.skuCode);
    const safeName = clipTsplText(input.name, 34);
    const safeArticle = clipTsplText(input.article ?? '', 28);
    const safeVariant = clipTsplText([input.color, input.size].filter(Boolean).join(' / '), 28);

    // Русский комментарий: SKU-этикетка печатает основной штрихкод и короткую карточку товара для маркировки единицы хранения.
    return [
      'SIZE 60 mm,40 mm',
      'GAP 2 mm,0',
      'CLS',
      safeClient ? `TEXT 30,20,"2",0,1,1,"${safeClient}"` : '',
      `TEXT 30,55,"3",0,1,1,"${safeName}"`,
      `TEXT 30,95,"2",0,1,1,"SKU: ${safeSku}"`,
      safeArticle ? `TEXT 30,125,"2",0,1,1,"Арт: ${safeArticle}"` : '',
      safeVariant ? `TEXT 30,155,"2",0,1,1,"${safeVariant}"` : '',
      `BARCODE 30,205,"128",70,1,0,2,2,"${safeBarcode}"`,
      'PRINT 1',
    ]
      .filter(Boolean)
      .join('\n');
  }

  palletLabel(input: PalletLabelInput) {
    const safeClient = sanitizeTsplText(input.clientName);
    const safePallet = sanitizeTsplText(input.palletCode);
    const safeZone = sanitizeTsplText(input.zoneCode ?? '');

    // Русский комментарий: паллетная этикетка крупнее коробной, чтобы код читался с расстояния при складских перемещениях.
    return [
      'SIZE 100 mm,70 mm',
      'GAP 2 mm,0',
      'CLS',
      `TEXT 45,35,"4",0,1,1,"${safeClient}"`,
      `TEXT 45,95,"4",0,1,1,"Паллета: ${safePallet}"`,
      safeZone ? `TEXT 45,150,"3",0,1,1,"Зона: ${safeZone}"` : '',
      `TEXT 45,195,"3",0,1,1,"Коробов: ${input.boxesCount ?? 0}"`,
      `BARCODE 45,265,"128",120,1,0,3,3,"${safePallet}"`,
      'PRINT 1',
    ]
      .filter(Boolean)
      .join('\n');
  }
}

function sanitizeTsplText(value: string) {
  return value.replace(/"/g, '').trim();
}

function clipTsplText(value: string, maxLength: number) {
  const sanitized = sanitizeTsplText(value);
  return sanitized.length > maxLength ? `${sanitized.slice(0, maxLength - 1)}…` : sanitized;
}
