import { Injectable } from '@nestjs/common';

export type BoxLabelInput = {
  boxCode: string;
  clientName: string;
  quantity?: number;
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
}

function sanitizeTsplText(value: string) {
  return value.replace(/"/g, '').trim();
}
