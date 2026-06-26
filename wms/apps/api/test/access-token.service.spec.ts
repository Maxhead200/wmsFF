import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AccessTokenService } from '../src/modules/auth/access-token.service';

describe('AccessTokenService', () => {
  const service = new AccessTokenService({
    get: (key: string) => (key === 'JWT_ACCESS_SECRET' ? 'test-secret' : 'test'),
  } as never);

  it('подписывает и проверяет access token', () => {
    const token = service.sign('user-1');

    expect(service.verify(token)).toMatchObject({ sub: 'user-1' });
  });

  it('отклоняет токен с измененной подписью', () => {
    const token = service.sign('user-1');
    const tampered = `${token.slice(0, -1)}x`;

    expect(() => service.verify(tampered)).toThrow(UnauthorizedException);
  });
});
