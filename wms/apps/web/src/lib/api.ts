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

export type RoleSummary = {
  id: string;
  code: string;
  name: string;
  permissions: Array<{
    code: string;
    name: string;
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

export async function fetchStockBalances(accessToken: string) {
  return request<StockBalance[]>('/stock/balances', {
    accessToken,
  });
}

export async function fetchRoles(accessToken: string) {
  return request<RoleSummary[]>('/users/roles', {
    accessToken,
  });
}

export async function fetchLogisticsTariffSets(accessToken: string) {
  return request<LogisticsTariffSetSummary[]>('/logistics/tariff-sets', {
    accessToken,
  });
}

async function request<T>(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown; accessToken?: string } = {},
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
