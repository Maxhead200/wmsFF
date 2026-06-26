export type AuthUser = {
  id: string;
  email: string;
  name: string;
  roleCodes: string[];
  permissionCodes: string[];
};

export type TokenPayload = {
  sub: string;
  iat: number;
  exp: number;
};
