import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

@Injectable()
export class PasswordService {
  async hash(password: string) {
    const salt = randomBytes(16).toString('base64url');
    const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
    return `scrypt$v1$${salt}$${derived.toString('base64url')}`;
  }

  async verify(password: string, storedHash: string) {
    const [algorithm, version, salt, hash] = storedHash.split('$');
    if (algorithm !== 'scrypt' || version !== 'v1' || !salt || !hash) {
      return false;
    }

    const expected = Buffer.from(hash, 'base64url');
    const derived = (await scrypt(password, salt, expected.length)) as Buffer;

    // Русский комментарий: сравниваем через timingSafeEqual, чтобы не выдавать пароль временем ответа.
    return expected.length === derived.length && timingSafeEqual(expected, derived);
  }
}
