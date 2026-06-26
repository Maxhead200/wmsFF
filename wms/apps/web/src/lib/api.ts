export type AuthUser = {
  id: string;
  email: string;
  name: string;
  roleCodes: string[];
  permissionCodes: string[];
  clientScopeMode: 'ALL' | 'LIMITED';
  clientIds: string[];
  writableClientIds: string[];
};

export type AuthSession = {
  accessToken: string;
  tokenType: 'Bearer';
  user: AuthUser;
};

export type ClientSummary = {
  id: string;
  code: string;
  name: string;
  inn: string | null;
  email: string | null;
  status: string;
  createdAt: string;
};

export type ClientRequestType = 'INBOUND' | 'OUTBOUND' | 'RETURN' | 'DELIVERY' | 'SERVICE' | 'OTHER';

export type ClientRequestStatus =
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'IN_WORK'
  | 'PACKED'
  | 'DONE'
  | 'CANCELLED'
  | 'REJECTED';

export type ClientRequestPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export type BillingUnit = 'SERVICE' | 'PIECE' | 'BOX' | 'PALLET' | 'LITER' | 'LITER_DAY' | 'DAY' | 'HOUR';

export type BillingChargeStatus = 'DRAFT' | 'APPROVED' | 'CANCELLED';

export type BillingChargeSource = 'MANUAL' | 'STORAGE' | 'LOGISTICS';

export type BillingInvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED';

export type BillingPaymentStatus = 'RECORDED' | 'CANCELLED';

export type BillingServiceSummary = {
  id: string;
  code: string;
  name: string;
  unit: BillingUnit;
  defaultPriceRub: string | number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BillingChargeSummary = {
  id: string;
  clientId: string;
  serviceId: string | null;
  requestId: string | null;
  description: string;
  unit: BillingUnit;
  quantity: string | number;
  unitPriceRub: string | number;
  totalRub: string | number;
  status: BillingChargeStatus;
  serviceDate: string;
  source: BillingChargeSource;
  sourceKey: string | null;
  metadata: Record<string, unknown> | null;
  comment: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  client: Pick<ClientSummary, 'id' | 'code' | 'name'>;
  service: BillingServiceSummary | null;
  request: Pick<ClientRequestSummary, 'id' | 'title' | 'type' | 'status'> | null;
  createdBy: {
    id: string;
    email: string;
    name: string;
  } | null;
  approvedBy: {
    id: string;
    email: string;
    name: string;
  } | null;
};

export type BillingInvoiceItemSummary = {
  id: string;
  invoiceId: string;
  chargeId: string | null;
  description: string;
  unit: BillingUnit;
  quantity: string | number;
  unitPriceRub: string | number;
  totalRub: string | number;
  serviceDate: string;
  charge: Pick<BillingChargeSummary, 'id' | 'description' | 'status'> | null;
};

export type BillingPaymentSummary = {
  id: string;
  invoiceId: string;
  clientId: string;
  amountRub: string | number;
  paidAt: string;
  method: string | null;
  reference: string | null;
  comment: string | null;
  status: BillingPaymentStatus;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BillingInvoiceSummary = {
  id: string;
  number: string;
  clientId: string;
  periodFrom: string;
  periodTo: string;
  dueDate: string | null;
  status: BillingInvoiceStatus;
  totalRub: string | number;
  paidRub: string | number;
  issuedAt: string | null;
  paidAt: string | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  client: Pick<ClientSummary, 'id' | 'code' | 'name'>;
  items: BillingInvoiceItemSummary[];
  payments: BillingPaymentSummary[];
  createdBy: {
    id: string;
    email: string;
    name: string;
  } | null;
};

export type BillingInvoiceDocument = {
  invoiceId: string;
  number: string;
  title: string;
  fileName: string;
  status: BillingInvoiceStatus;
  statusLabel: string;
  periodFrom: string;
  periodTo: string;
  dueDate: string | null;
  issuedAt: string | null;
  totalRub: number;
  paidRub: number;
  remainingRub: number;
  comment: string | null;
  client: {
    id: string;
    code: string;
    name: string;
    inn: string | null;
    kpp: string | null;
    legalAddress: string | null;
    actualAddress: string | null;
    email: string | null;
    phone: string | null;
  };
  rows: Array<{
    position: number;
    description: string;
    unit: BillingUnit;
    quantity: number;
    unitPriceRub: number;
    totalRub: number;
    serviceDate: string;
  }>;
  payments: Array<{
    id: string;
    amountRub: number;
    paidAt: string;
    method: string | null;
    reference: string | null;
    comment: string | null;
  }>;
  createdBy: {
    id: string;
    email: string;
    name: string;
  } | null;
  html: string;
};

export type ClientRequestDocument = {
  requestId: string;
  title: string;
  fileName: string;
  type: ClientRequestType;
  typeLabel: string;
  status: ClientRequestStatus;
  statusLabel: string;
  priority: ClientRequestPriority;
  priorityLabel: string;
  createdAt: string;
  updatedAt: string;
  desiredDate: string | null;
  comment: string | null;
  managerComment: string | null;
  contactName: string | null;
  contactPhone: string | null;
  deliveryAddress: string | null;
  rowsCount: number;
  totalQuantity: number;
  client: {
    id: string;
    code: string;
    name: string;
    inn: string | null;
    kpp: string | null;
    legalAddress: string | null;
    actualAddress: string | null;
    email: string | null;
    phone: string | null;
  };
  rows: Array<{
    position: number;
    skuId: string | null;
    internalSku: string | null;
    clientSku: string | null;
    article: string | null;
    barcode: string | null;
    name: string | null;
    quantity: number;
    comment: string | null;
  }>;
  createdBy: {
    id: string;
    email: string;
    name: string;
  } | null;
  assignedTo: {
    id: string;
    email: string;
    name: string;
  } | null;
  html: string;
};

export type CreateBillingServicePayload = {
  code: string;
  name: string;
  unit?: BillingUnit;
  defaultPriceRub?: number;
  isActive?: boolean;
};

export type CreateBillingChargePayload = {
  clientId: string;
  serviceId?: string;
  requestId?: string;
  description?: string;
  unit?: BillingUnit;
  quantity: number;
  unitPriceRub?: number;
  serviceDate?: string;
  comment?: string;
};

export type CreateBillingInvoicePayload = {
  clientId: string;
  periodFrom: string;
  periodTo: string;
  dueDate?: string;
  chargeIds?: string[];
  comment?: string;
};

export type GenerateStorageChargePayload = {
  clientId: string;
  periodFrom: string;
  periodTo: string;
  unitPriceRub?: number;
  serviceDate?: string;
  approve?: boolean;
  comment?: string;
};

export type CreateBillingPaymentPayload = {
  invoiceId: string;
  amountRub: number;
  paidAt?: string;
  method?: string;
  reference?: string;
  comment?: string;
};

export type ClientRequestItem = {
  id: string;
  requestId: string;
  skuId: string | null;
  barcode: string | null;
  name: string | null;
  quantity: number;
  comment: string | null;
  sku: {
    id: string;
    internalSku: string;
    name: string;
  } | null;
};

export type ClientRequestSummary = {
  id: string;
  clientId: string;
  type: ClientRequestType;
  status: ClientRequestStatus;
  priority: ClientRequestPriority;
  title: string;
  comment: string | null;
  contactName: string | null;
  contactPhone: string | null;
  deliveryAddress: string | null;
  desiredDate: string | null;
  managerComment: string | null;
  createdAt: string;
  updatedAt: string;
  client: Pick<ClientSummary, 'id' | 'code' | 'name'>;
  createdBy: {
    id: string;
    email: string;
    name: string;
  } | null;
  assignedTo: {
    id: string;
    email: string;
    name: string;
  } | null;
  items: ClientRequestItem[];
};

export type CreateClientRequestPayload = {
  clientId: string;
  type: ClientRequestType;
  priority?: ClientRequestPriority;
  title: string;
  comment?: string;
  contactName?: string;
  contactPhone?: string;
  deliveryAddress?: string;
  desiredDate?: string;
  items?: Array<{
    skuId?: string;
    barcode?: string;
    name?: string;
    quantity: number;
    comment?: string;
  }>;
};

export type CreateClientPayload = {
  code: string;
  name: string;
  inn?: string;
  kpp?: string;
  phone?: string;
  email?: string;
};

export type StockBalance = {
  id: string;
  clientId: string;
  skuId: string;
  boxId: string | null;
  palletId: string | null;
  status: string;
  quantity: number;
  updatedAt: string;
  sku: {
    id: string;
    internalSku: string;
    clientSku: string | null;
    article: string | null;
    name: string;
    barcodes: Array<{
      id: string;
      value: string;
      isPrimary: boolean;
    }>;
  };
  box: {
    id: string;
    code: string;
    status: string;
  } | null;
  pallet: {
    id: string;
    code: string;
    status: string;
  } | null;
};

export type SkuSummary = {
  id: string;
  clientId: string;
  internalSku: string;
  clientSku: string | null;
  article: string | null;
  name: string;
  color: string | null;
  size: string | null;
  lengthCm: string | number | null;
  widthCm: string | number | null;
  heightCm: string | number | null;
  volumeLiters: string | number | null;
  volumeSource: string;
  needsChestnyZnak: boolean;
  barcodes: Array<{
    id: string;
    value: string;
    isPrimary: boolean;
  }>;
  _count?: {
    balances: number;
    movements: number;
  };
};

export type CreateSkuPayload = {
  clientId: string;
  internalSku: string;
  clientSku?: string;
  article?: string;
  name: string;
  barcode?: string;
  color?: string;
  size?: string;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  needsChestnyZnak?: boolean;
};

export type WarehouseBoxSummary = {
  id: string;
  clientId: string;
  zoneId: string | null;
  palletId: string | null;
  code: string;
  status: string;
  client: ClientSummary;
  zone: {
    id: string;
    code: string;
    name: string;
  } | null;
  pallet: {
    id: string;
    code: string;
    status: string;
  } | null;
  _count: {
    balances: number;
    movements: number;
  };
};

export type TransferBetweenBoxesPayload = {
  clientId: string;
  skuId?: string;
  barcode?: string;
  fromBoxCode: string;
  toBoxCode: string;
  quantity: number;
  status?: string;
  idempotencyKey: string;
  comment?: string;
};

export type TransferBetweenBoxesResult = {
  idempotencyKey: string;
  status: 'APPLIED' | 'ALREADY_APPLIED';
  skuId?: string;
  fromBox?: string;
  toBox?: string;
  quantity?: number;
  targetBalance?: {
    id: string;
    balanceKey: string;
    clientId: string;
    skuId: string;
    boxId: string | null;
    palletId: string | null;
    status: string;
    quantity: number;
    updatedAt: string;
  };
};

type FulfillmentAllocation = {
  boxId: string | null;
  palletId: string | null;
  quantity: number;
};

type FulfillmentLineBase = {
  itemId: string;
  skuId: string;
  requestedQuantity: number;
  allocations: FulfillmentAllocation[];
};

export type PickClientRequestResult = {
  idempotencyKey: string;
  status: 'APPLIED' | 'ALREADY_APPLIED';
  requestId: string;
  clientId?: string;
  pickedLines?: Array<
    FulfillmentLineBase & {
    pickedQuantity: number;
    }
  >;
};

export type FulfillClientRequestResult = {
  idempotencyKey: string;
  status: 'APPLIED' | 'ALREADY_APPLIED';
  requestId: string;
  clientId?: string;
  packedLines?: Array<
    FulfillmentLineBase & {
      packedQuantity: number;
    }
  >;
  shippedLines?: Array<
    FulfillmentLineBase & {
      shippedQuantity: number;
    }
  >;
};

export type RoleSummary = {
  id: string;
  code: string;
  name: string;
  permissions: Array<{
    code: string;
    name: string;
  }>;
};

export type UserClientScope = {
  canRead: boolean;
  canWrite: boolean;
  client: Pick<ClientSummary, 'id' | 'code' | 'name'>;
};

export type UserSummary = {
  id: string;
  email: string;
  name: string;
  status: string;
  createdAt?: string;
  roles: Array<{
    role: {
      code: string;
      name: string;
    };
  }>;
  clientScopes: UserClientScope[];
};

export type CreateUserPayload = {
  email: string;
  name: string;
  password: string;
  roleCodes?: string[];
  clientIds?: string[];
  writableClientIds?: string[];
};

export type UpdateUserClientScopesPayload = {
  scopes: Array<{
    clientId: string;
    canRead?: boolean;
    canWrite?: boolean;
  }>;
};

export type TsdDeviceSummary = {
  id: string;
  code: string;
  name: string;
  status: string;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string;
    status: string;
  };
};

export type CreateTsdDevicePayload = {
  code: string;
  name: string;
  userId: string;
};

export type CreatedTsdDevice = Omit<TsdDeviceSummary, 'lastLoginAt' | 'lastSeenAt' | 'user'> & {
  userId: string;
  deviceSecret: string;
};

export type TsdReviewOperation = {
  id: string;
  deviceId: string;
  operationKey: string;
  operationType: string;
  payload: Record<string, unknown>;
  status: 'ACCEPTED' | 'NEEDS_REVIEW' | 'REJECTED';
  serverMessage: string | null;
  reviewAction: 'APPLY_INVENTORY_ADJUSTMENT' | 'REJECT' | null;
  reviewComment: string | null;
  reviewedByUserId: string | null;
  reviewedBy?: {
    id: string;
    email: string;
    name: string;
  } | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ResolveTsdReviewPayload = {
  action: 'APPLY_INVENTORY_ADJUSTMENT' | 'REJECT';
  comment?: string;
};

export type ResolveTsdReviewResult = {
  operation: TsdReviewOperation;
  resolution: {
    action: ResolveTsdReviewPayload['action'];
    adjustment?: {
      idempotencyKey: string;
      status: 'APPLIED' | 'ALREADY_APPLIED' | 'NO_CHANGE';
      skuId?: string;
      box?: string;
      previousQuantity?: number;
      countedQuantity?: number;
      delta?: number;
    };
  };
};

export type LogisticsTariffSetSummary = {
  id: string;
  name: string;
  sourceFile: string | null;
  note: string | null;
  activeFrom: string | null;
  activeTo: string | null;
  createdAt: string;
  _count: {
    directions: number;
  };
};

export type LogisticsQuotePayload = {
  tariffSetId?: string;
  origin: string;
  destination: string;
  pallets?: number;
  boxes?: number;
  quoteDate?: string;
};

export type LogisticsQuoteResult = {
  tariffSet: {
    id: string;
    name: string;
    sourceFile: string | null;
  };
  route: {
    origin: string;
    destination: string;
  };
  input: {
    boxes: number | null;
    pallets: number | null;
  };
  tier: {
    label: string;
    minPallets: number | null;
    maxPallets: number | null;
    maxBoxes: number | null;
    pricingMode: LogisticsPricingMode;
    priceRub: number;
  };
  estimatedTotalRub: number | null;
  requiresManualReview: boolean;
  note: string | null;
};

export type BoxLabelPreviewPayload = {
  boxCode: string;
  clientName: string;
  quantity?: number;
};

export type BoxLabelPreview = {
  printerLanguage: 'TSPL';
  tspl: string;
};

export type StockImportIssue = {
  row: number;
  message: string;
  severity: 'warning' | 'error';
};

export type StockImportSummary = {
  rows: number;
  boxes: number;
  barcodes: number;
  totalQuantity: number;
};

export type StockImportSampleItem = {
  clientId: string;
  boxCode: string;
  barcode: string;
  name: string;
  color?: string;
  size?: string;
  quantity: number;
  sourceRow: number;
};

export type StockImportPreview = {
  clientId: string;
  summary: StockImportSummary;
  issues: StockImportIssue[];
  sample: StockImportSampleItem[];
};

export type StockImportCommitResult = {
  sourceDocument: string;
  summary: StockImportSummary;
  warnings: StockImportIssue[];
  result: {
    boxesTouched: number;
    skusTouched: number;
    movementsCreated: number;
    balancesTouched: number;
  };
};

export type LogisticsPricingMode = 'TOTAL' | 'PER_PALLET' | 'MANUAL_REVIEW';

export type LogisticsDeliveryStatus = 'REQUESTED' | 'QUOTED' | 'PLANNED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';

export type LogisticsDeliveryRequestSummary = {
  id: string;
  clientId: string;
  requestId: string | null;
  tariffSetId: string | null;
  billingChargeId: string | null;
  origin: string;
  destination: string;
  boxes: number | null;
  pallets: number | null;
  desiredShipDate: string | null;
  plannedShipDate: string | null;
  status: LogisticsDeliveryStatus;
  estimatedTotalRub: string | number | null;
  requiresManualReview: boolean;
  comment: string | null;
  managerComment: string | null;
  createdAt: string;
  updatedAt: string;
  client: Pick<ClientSummary, 'id' | 'code' | 'name'>;
  request: Pick<ClientRequestSummary, 'id' | 'title' | 'type' | 'status'> | null;
  tariffSet: Pick<LogisticsTariffSetSummary, 'id' | 'name'> | null;
  billingCharge: Pick<BillingChargeSummary, 'id' | 'description' | 'status' | 'totalRub'> | null;
  createdBy: {
    id: string;
    email: string;
    name: string;
  } | null;
};

export type CreateLogisticsDeliveryRequestPayload = {
  clientId: string;
  requestId?: string;
  tariffSetId?: string;
  origin: string;
  destination: string;
  boxes?: number;
  pallets?: number;
  desiredShipDate?: string;
  comment?: string;
};

export type LogisticsImportTier = {
  label: string;
  priceRub: number;
  minPallets?: number;
  maxPallets?: number;
  maxBoxes?: number;
  pricingMode: LogisticsPricingMode;
};

export type LogisticsImportDirection = {
  origin: string;
  destination: string;
  pricingMode: LogisticsPricingMode;
  tiers: LogisticsImportTier[];
};

export type LogisticsImportIssue = {
  row: number;
  message: string;
};

export type LogisticsImportPreview = {
  note: string;
  directionsCount: number;
  directions: LogisticsImportDirection[];
  issues: LogisticsImportIssue[];
};

export type LogisticsImportCommitResult = {
  tariffSetId: string;
  name: string;
  sourceFile: string | null;
  directionsCount: number;
  tiersCount: number;
};

type LoginPayload = {
  email: string;
  password: string;
};

type BootstrapPayload = LoginPayload & {
  name: string;
  bootstrapSecret: string;
};

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1';

export async function login(payload: LoginPayload) {
  return request<AuthSession>('/auth/login', {
    method: 'POST',
    body: payload,
  });
}

export async function bootstrapAdmin(payload: BootstrapPayload) {
  return request<AuthSession>('/auth/bootstrap', {
    method: 'POST',
    body: payload,
  });
}

export async function fetchMe(accessToken: string) {
  return request<AuthUser>('/auth/me', {
    accessToken,
  });
}

export async function fetchClients(accessToken: string) {
  return request<ClientSummary[]>('/clients', {
    accessToken,
  });
}

export async function fetchClientRequests(
  accessToken: string,
  filter: { clientId?: string; status?: ClientRequestStatus; type?: ClientRequestType } = {},
) {
  return request<ClientRequestSummary[]>(withQuery('/client-requests', filter), {
    accessToken,
  });
}

export async function fetchClientRequestDocument(accessToken: string, requestId: string) {
  return request<ClientRequestDocument>(`/client-requests/${requestId}/document`, {
    accessToken,
  });
}

export async function fetchBillingServices(accessToken: string) {
  return request<BillingServiceSummary[]>('/billing/services', {
    accessToken,
  });
}

export async function createBillingService(accessToken: string, payload: CreateBillingServicePayload) {
  return request<BillingServiceSummary>('/billing/services', {
    method: 'POST',
    body: payload,
    accessToken,
  });
}

export async function fetchBillingCharges(
  accessToken: string,
  filter: { clientId?: string; status?: BillingChargeStatus } = {},
) {
  return request<BillingChargeSummary[]>(withQuery('/billing/charges', filter), {
    accessToken,
  });
}

export async function createBillingCharge(accessToken: string, payload: CreateBillingChargePayload) {
  return request<BillingChargeSummary>('/billing/charges', {
    method: 'POST',
    body: payload,
    accessToken,
  });
}

export async function updateBillingChargeStatus(
  accessToken: string,
  chargeId: string,
  payload: { status: BillingChargeStatus },
) {
  return request<BillingChargeSummary>(`/billing/charges/${chargeId}/status`, {
    method: 'PATCH',
    body: payload,
    accessToken,
  });
}

export async function generateStorageCharge(accessToken: string, payload: GenerateStorageChargePayload) {
  return request<BillingChargeSummary>('/billing/charges/storage', {
    method: 'POST',
    body: payload,
    accessToken,
  });
}

export async function fetchBillingInvoices(
  accessToken: string,
  filter: { clientId?: string; status?: BillingInvoiceStatus; periodFrom?: string; periodTo?: string } = {},
) {
  return request<BillingInvoiceSummary[]>(withQuery('/billing/invoices', filter), {
    accessToken,
  });
}

export async function fetchBillingInvoiceDocument(accessToken: string, invoiceId: string) {
  return request<BillingInvoiceDocument>(`/billing/invoices/${invoiceId}/document`, {
    accessToken,
  });
}

export async function createBillingInvoice(accessToken: string, payload: CreateBillingInvoicePayload) {
  return request<BillingInvoiceSummary>('/billing/invoices', {
    method: 'POST',
    body: payload,
    accessToken,
  });
}

export async function updateBillingInvoiceStatus(
  accessToken: string,
  invoiceId: string,
  payload: { status: BillingInvoiceStatus },
) {
  return request<BillingInvoiceSummary>(`/billing/invoices/${invoiceId}/status`, {
    method: 'PATCH',
    body: payload,
    accessToken,
  });
}

export async function createBillingPayment(accessToken: string, payload: CreateBillingPaymentPayload) {
  return request<BillingInvoiceSummary>('/billing/payments', {
    method: 'POST',
    body: payload,
    accessToken,
  });
}

export async function createClientRequest(accessToken: string, payload: CreateClientRequestPayload) {
  return request<ClientRequestSummary>('/client-requests', {
    method: 'POST',
    body: payload,
    accessToken,
  });
}

export async function updateClientRequestStatus(
  accessToken: string,
  requestId: string,
  payload: { status: ClientRequestStatus; managerComment?: string },
) {
  return request<ClientRequestSummary>(`/client-requests/${requestId}/status`, {
    method: 'PATCH',
    body: payload,
    accessToken,
  });
}

export async function createClient(accessToken: string, payload: CreateClientPayload) {
  return request<ClientSummary>('/clients', {
    method: 'POST',
    body: payload,
    accessToken,
  });
}

export async function fetchSkus(accessToken: string, filter: { clientId?: string; search?: string } = {}) {
  return request<SkuSummary[]>(withQuery('/skus', filter), {
    accessToken,
  });
}

export async function createSku(accessToken: string, payload: CreateSkuPayload) {
  return request<SkuSummary>('/skus', {
    method: 'POST',
    body: payload,
    accessToken,
  });
}

export async function fetchStockBalances(accessToken: string, filter: { clientId?: string } = {}) {
  return request<StockBalance[]>(withQuery('/stock/balances', filter), {
    accessToken,
  });
}

export async function fetchBoxes(accessToken: string, filter: { clientId?: string; code?: string } = {}) {
  return request<WarehouseBoxSummary[]>(withQuery('/warehouse/boxes', filter), {
    accessToken,
  });
}

export async function fetchRoles(accessToken: string) {
  return request<RoleSummary[]>('/users/roles', {
    accessToken,
  });
}

export async function fetchUsers(accessToken: string) {
  return request<UserSummary[]>('/users', {
    accessToken,
  });
}

export async function createUser(accessToken: string, payload: CreateUserPayload) {
  return request<UserSummary>('/users', {
    method: 'POST',
    body: payload,
    accessToken,
  });
}

export async function updateUserClientScopes(
  accessToken: string,
  userId: string,
  payload: UpdateUserClientScopesPayload,
) {
  return request<Pick<UserSummary, 'id' | 'email' | 'name' | 'status' | 'clientScopes'>>(
    `/users/${userId}/client-scopes`,
    {
      method: 'PATCH',
      body: payload,
      accessToken,
    },
  );
}

export async function fetchTsdDevices(accessToken: string) {
  return request<TsdDeviceSummary[]>('/tsd/devices', {
    accessToken,
  });
}

export async function createTsdDevice(accessToken: string, payload: CreateTsdDevicePayload) {
  return request<CreatedTsdDevice>('/tsd/devices', {
    method: 'POST',
    body: payload,
    accessToken,
  });
}

export async function fetchTsdReviewQueue(accessToken: string) {
  return request<TsdReviewOperation[]>('/tsd/review', {
    accessToken,
  });
}

export async function fetchTsdReviewHistory(accessToken: string) {
  return request<TsdReviewOperation[]>('/tsd/review/history', {
    accessToken,
  });
}

export async function resolveTsdReviewOperation(
  accessToken: string,
  operationId: string,
  payload: ResolveTsdReviewPayload,
) {
  return request<ResolveTsdReviewResult>(`/tsd/review/${operationId}`, {
    method: 'PATCH',
    body: payload,
    accessToken,
  });
}

export async function fetchLogisticsTariffSets(accessToken: string) {
  return request<LogisticsTariffSetSummary[]>('/logistics/tariff-sets', {
    accessToken,
  });
}

export async function fetchLogisticsDeliveryRequests(
  accessToken: string,
  filter: { clientId?: string; status?: LogisticsDeliveryStatus } = {},
) {
  return request<LogisticsDeliveryRequestSummary[]>(withQuery('/logistics/delivery-requests', filter), {
    accessToken,
  });
}

export async function quoteLogistics(accessToken: string, payload: LogisticsQuotePayload) {
  return request<LogisticsQuoteResult>('/logistics/quote', {
    method: 'POST',
    body: payload,
    accessToken,
  });
}

export async function createLogisticsDeliveryRequest(
  accessToken: string,
  payload: CreateLogisticsDeliveryRequestPayload,
) {
  return request<LogisticsDeliveryRequestSummary>('/logistics/delivery-requests', {
    method: 'POST',
    body: payload,
    accessToken,
  });
}

export async function updateLogisticsDeliveryStatus(
  accessToken: string,
  deliveryId: string,
  payload: { status: LogisticsDeliveryStatus; plannedShipDate?: string; managerComment?: string },
) {
  return request<LogisticsDeliveryRequestSummary>(`/logistics/delivery-requests/${deliveryId}/status`, {
    method: 'PATCH',
    body: payload,
    accessToken,
  });
}

export async function generateLogisticsDeliveryBillingCharge(accessToken: string, deliveryId: string) {
  return request<LogisticsDeliveryRequestSummary>(`/logistics/delivery-requests/${deliveryId}/billing-charge`, {
    method: 'POST',
    accessToken,
  });
}

export async function previewBoxLabel(accessToken: string, payload: BoxLabelPreviewPayload) {
  return request<BoxLabelPreview>('/print/box-label/preview', {
    method: 'POST',
    body: payload,
    accessToken,
  });
}

export async function previewStockImport(accessToken: string, payload: { file: File; clientId: string }) {
  const form = new FormData();
  form.append('file', payload.file);
  form.append('clientId', payload.clientId);

  return requestMultipart<StockImportPreview>('/imports/stocks/preview', form, accessToken);
}

export async function commitStockImport(
  accessToken: string,
  payload: { file: File; clientId: string; sourceDocument?: string },
) {
  const form = new FormData();
  form.append('file', payload.file);
  form.append('clientId', payload.clientId);
  if (payload.sourceDocument) {
    form.append('sourceDocument', payload.sourceDocument);
  }

  return requestMultipart<StockImportCommitResult>('/imports/stocks/commit', form, accessToken);
}

export async function previewLogisticsImport(accessToken: string, payload: { file: File }) {
  const form = new FormData();
  form.append('file', payload.file);

  return requestMultipart<LogisticsImportPreview>('/imports/logistics/preview', form, accessToken);
}

export async function commitLogisticsImport(
  accessToken: string,
  payload: { file: File; name?: string; activeFrom?: string; activeTo?: string },
) {
  const form = new FormData();
  form.append('file', payload.file);
  if (payload.name) {
    form.append('name', payload.name);
  }
  if (payload.activeFrom) {
    form.append('activeFrom', payload.activeFrom);
  }
  if (payload.activeTo) {
    form.append('activeTo', payload.activeTo);
  }

  return requestMultipart<LogisticsImportCommitResult>('/imports/logistics/commit', form, accessToken);
}

export async function transferBetweenBoxes(accessToken: string, payload: TransferBetweenBoxesPayload) {
  return request<TransferBetweenBoxesResult>('/stock/transfers/box-to-box', {
    method: 'POST',
    body: payload,
    accessToken,
  });
}

export async function pickClientRequest(
  accessToken: string,
  payload: { requestId: string; idempotencyKey?: string; comment?: string },
) {
  return request<PickClientRequestResult>('/stock/fulfillment/pick-request', {
    method: 'POST',
    body: payload,
    accessToken,
  });
}

export async function packageClientRequest(
  accessToken: string,
  payload: { requestId: string; idempotencyKey?: string; comment?: string },
) {
  return request<FulfillClientRequestResult>('/stock/fulfillment/package-request', {
    method: 'POST',
    body: payload,
    accessToken,
  });
}

export async function shipClientRequest(
  accessToken: string,
  payload: { requestId: string; idempotencyKey?: string; comment?: string },
) {
  return request<FulfillClientRequestResult>('/stock/fulfillment/ship-request', {
    method: 'POST',
    body: payload,
    accessToken,
  });
}

async function request<T>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown; accessToken?: string } = {},
) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    throw new Error(await responseError(response));
  }

  return (await response.json()) as T;
}

function withQuery(path: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      search.set(key, value);
    }
  });

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

async function requestMultipart<T>(path: string, body: FormData, accessToken: string) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body,
  });

  if (!response.ok) {
    throw new Error(await responseError(response));
  }

  return (await response.json()) as T;
}

async function responseError(response: Response) {
  try {
    const payload = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(payload.message)) {
      return payload.message.join('\n');
    }

    return payload.message || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}
