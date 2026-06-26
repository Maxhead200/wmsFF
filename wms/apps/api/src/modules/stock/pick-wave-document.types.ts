import { PickWaveRequestStatus, PickWaveStatus } from '@prisma/client';

export type WaveAllocation = {
  boxId: string | null;
  boxCode: string | null;
  palletId: string | null;
  palletCode: string | null;
  quantity: number;
  source: 'planned' | 'picked';
};

export type PickWaveDocumentRow = {
  position: number;
  requestId: string;
  requestTitle: string;
  requestStatus: string;
  waveRequestStatus: PickWaveRequestStatus;
  clientCode: string;
  clientName: string;
  itemId: string;
  skuId: string | null;
  internalSku: string | null;
  name: string | null;
  barcode: string | null;
  requestedQuantity: number;
  pickedQuantity: number;
  allocations: WaveAllocation[];
};

export type PickWaveDocumentPayload = {
  waveId: string;
  waveNumber: string;
  title: string;
  fileName: string;
  status: PickWaveStatus;
  statusLabel: string;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  generatedAt: string;
  createdBy: {
    id: string;
    email: string;
    name: string;
  } | null;
  assignedPicker: {
    id: string;
    email: string;
    name: string;
  } | null;
  requestsCount: number;
  rowsCount: number;
  totalRequested: number;
  totalPicked: number;
  rows: PickWaveDocumentRow[];
};
