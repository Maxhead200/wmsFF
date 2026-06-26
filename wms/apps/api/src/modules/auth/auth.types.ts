export type AuthUser = {
  id: string;
  email: string;
  name: string;
  roleCodes: string[];
  permissionCodes: string[];
  clientScopeMode: 'ALL' | 'LIMITED';
  clientIds: string[];
  writableClientIds: string[];
  deviceId?: string;
  deviceCode?: string;
};

export type TokenPayload = {
  sub: string;
  deviceId?: string;
  deviceCode?: string;
  iat: number;
  exp: number;
};
