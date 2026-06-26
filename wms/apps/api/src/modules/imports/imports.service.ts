import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { parseLogisticsTariffSheet } from './parsers/logistics-xlsx.parser';
import { parseStockSheet, type SheetMatrix } from './parsers/stock-xlsx.parser';

@Injectable()
export class ImportsService {
  previewStockWorkbook(buffer: Buffer, clientId: string) {
    const rows = this.readFirstSheet(buffer);
    const parsed = parseStockSheet(rows, { clientId });

    return {
      clientId,
      summary: parsed.summary,
      issues: parsed.issues,
      sample: parsed.items.slice(0, 20),
    };
  }

  previewLogisticsWorkbook(buffer: Buffer) {
    const rows = this.readFirstSheet(buffer);
    const parsed = parseLogisticsTariffSheet(rows);

    return {
      note: parsed.note,
      directionsCount: parsed.directions.length,
      directions: parsed.directions,
      issues: parsed.issues,
    };
  }

  private readFirstSheet(buffer: Buffer): SheetMatrix {
    // Русский комментарий: XLSX читаем как матрицу, чтобы не зависеть от кривых merged cells в исходных файлах.
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheet = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheet];
    return XLSX.utils.sheet_to_json<SheetMatrix[number]>(worksheet, {
      header: 1,
      raw: false,
      blankrows: false,
    });
  }
}
