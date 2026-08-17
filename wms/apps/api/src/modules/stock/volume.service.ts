import { Injectable } from '@nestjs/common';

export type VolumeRoundMode = 'math' | 'ceil';
export type VolumePrecision = 0.01 | 0.1 | 1;

export type VolumeInput = {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  precision?: VolumePrecision;
  mode?: VolumeRoundMode;
};

@Injectable()
export class VolumeService {
  calculateLiters(input: VolumeInput) {
    const rawLiters = (input.lengthCm * input.widthCm * input.heightCm) / 1000;
    const precision = input.precision ?? 0.01;
    const multiplier = 1 / precision;

    // Русский комментарий: округление задаётся тарифной политикой склада, поэтому режим вынесен параметром.
    const rounded =
      (input.mode ?? 'math') === 'ceil'
        ? Math.ceil(rawLiters * multiplier) / multiplier
        : Math.round(rawLiters * multiplier) / multiplier;

    return {
      rawLiters,
      liters: Number(rounded.toFixed(3)),
      source: 'CALCULATED' as const,
    };
  }

  totalLiters(unitLiters: number, quantity: number) {
    return Number((unitLiters * quantity).toFixed(3));
  }
}
