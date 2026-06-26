import { ClientRequestPriority, ClientRequestStatus } from '@prisma/client';

export type PickInstructionAllocation = {
  balanceId: string;
  boxId: string;
  boxCode: string;
  palletId: string | null;
  palletCode: string | null;
  quantity: number;
};

export type PickInstructionRowStatus = 'READY' | 'SHORTAGE' | 'SKU_NOT_FOUND';

export type PickInstructionRow = {
  position: number;
  itemId: string;
  skuId: string | null;
  internalSku: string | null;
  name: string | null;
  barcode: string | null;
  requestedQuantity: number;
  allocatedQuantity: number;
  shortageQuantity: number;
  status: PickInstructionRowStatus;
  statusLabel: string;
  comment: string | null;
  allocations: PickInstructionAllocation[];
};

export type PickInstructionBoxSummary = {
  boxId: string;
  boxCode: string;
  palletId: string | null;
  palletCode: string | null;
  allocatedQuantity: number;
  availableQuantity: number;
  linesCount: number;
  isFullBox: boolean;
  comment: string;
};

export type PickInstructionDocument = {
  requestId: string;
  title: string;
  fileName: string;
  requestTitle: string;
  requestStatus: ClientRequestStatus;
  requestStatusLabel: string;
  priority: ClientRequestPriority;
  priorityLabel: string;
  client: {
    id: string;
    code: string;
    name: string;
  };
  generatedAt: string;
  desiredDate: string | null;
  deliveryAddress: string | null;
  totalRequested: number;
  totalAllocated: number;
  totalShortage: number;
  rowsCount: number;
  readyRowsCount: number;
  shortageRowsCount: number;
  boxesCount: number;
  fullBoxesCount: number;
  rows: PickInstructionRow[];
  boxes: PickInstructionBoxSummary[];
};
