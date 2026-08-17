import { describe, expect, it } from 'vitest';
import { PasswordService } from '../src/modules/auth/password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('хеширует пароль и проверяет только правильное значение', async () => {
    const hash = await service.hash('very-strong-password');

    expect(hash).toMatch(/^scrypt\$v1\$/);
    expect(await service.verify('very-strong-password', hash)).toBe(true);
    expect(await service.verify('wrong-password', hash)).toBe(false);
  });
});
