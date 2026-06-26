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

export async function fetchLogisticsTariffSets(accessToken: string) {
  return request<LogisticsTariffSetSummary[]>('/logistics/tariff-sets', {
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
