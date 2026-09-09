/** Вход игрока: пароль и сессии.
 *
 *  Устроено так же, как вход сотрудников: пароль не хранится и не пишется в
 *  лог, в базе лежит scrypt-хэш с индивидуальной солью, а от токена входа —
 *  только отпечаток sha256. Утечка базы не даёт войти ни под кем.
 */
import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { PrismaService } from '../prisma/prisma.service';

const scryptAsync = promisify(scrypt) as (
  pw: string | Buffer, salt: Buffer, len: number) => Promise<Buffer>;

const KEY_LEN = 64;

/** Вход живёт полгода: человек записывается на корт раз в неделю, и просить
 *  пароль каждый месяц значит просить его вспоминать заново. */
const SESSION_DAYS = 180;

/** Защита от подбора. Считаем отдельно по номеру и по адресу, с которого
 *  стучатся: иначе останется возможным перебор либо одного номера, либо
 *  всех подряд. Счётчики в памяти — перезапуск их обнуляет, и это допустимо:
 *  перебор всё равно не успеет пройти между перезапусками. */
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const FORGET_MINUTES = 30;

type Fails = { count: number; last: number; until: number };

@Injectable()
export class ClientAuthService {
  constructor(private readonly db: PrismaService) {}

  private fails = new Map<string, Fails>();

  lockedFor(keys: string[]): number {
    const now = Date.now();
    let left = 0;
    for (const k of keys) {
      const f = this.fails.get(k);
      if (f && f.until > now) left = Math.max(left, Math.ceil((f.until - now) / 1000));
    }
    return left;
  }

  noteFail(keys: string[]): void {
    const now = Date.now();
    for (const k of keys) {
      const f = this.fails.get(k);
      const fresh = !f || now - f.last > FORGET_MINUTES * 60_000;
      const count = fresh ? 1 : f!.count + 1;
      this.fails.set(k, {
        count, last: now,
        until: count >= MAX_FAILS ? now + LOCK_MINUTES * 60_000 : 0,
      });
    }
    if (this.fails.size >= 500) {
      for (const [k, f] of this.fails) {
        if (now - f.last > FORGET_MINUTES * 60_000 && f.until < now) this.fails.delete(k);
      }
    }
  }

  clearFails(keys: string[]): void {
    for (const k of keys) this.fails.delete(k);
  }

  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await scryptAsync(password, salt, KEY_LEN);
    return `${salt.toString('hex')}:${key.toString('hex')}`;
  }

  /** Сверка постоянная по времени: иначе по задержке ответа подбирают хэш. */
  async verify(password: string, stored: string): Promise<boolean> {
    const [saltHex, keyHex] = stored.split(':');
    if (!saltHex || !keyHex) return false;
    const key = await scryptAsync(password, Buffer.from(saltHex, 'hex'), KEY_LEN);
    const want = Buffer.from(keyHex, 'hex');
    return key.length === want.length && timingSafeEqual(key, want);
  }

  private fingerprint(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Открыть вход и выдать токен. */
  async startSession(clientId: bigint): Promise<string> {
    const token = randomBytes(32).toString('hex');
    await this.db.client_sessions.create({
      data: {
        token_hash: this.fingerprint(token), client_id: clientId,
        expires_at: new Date(Date.now() + SESSION_DAYS * 864e5),
      },
    });
    return token;
  }

  /** Чей это токен. null — токена нет или он истёк. */
  async whoIs(token: string | undefined) {
    if (!token) return null;
    const s = await this.db.client_sessions.findUnique({
      where: { token_hash: this.fingerprint(token) },
      include: { clients: true },
    });
    if (!s || s.expires_at < new Date()) return null;

    // Продлеваем вход, но не чаще раза в сутки: иначе запись в базу
    // на каждый запрос списка записей.
    if (Date.now() - +s.last_seen > 864e5) {
      await this.db.client_sessions.update({
        where: { token_hash: s.token_hash },
        data: { last_seen: new Date(), expires_at: new Date(Date.now() + SESSION_DAYS * 864e5) },
      });
    }
    return s.clients;
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.db.client_sessions.deleteMany({ where: { token_hash: this.fingerprint(token) } });
  }

  /** Все входы человека закрываются: сменил пароль — чужие устройства отпали. */
  async dropSessions(clientId: bigint): Promise<void> {
    await this.db.client_sessions.deleteMany({ where: { client_id: clientId } });
  }

  /** Токен из заголовка Authorization: Bearer … */
  tokenOf(header: string | undefined): string | undefined {
    if (!header) return undefined;
    const m = /^Bearer\s+(\S+)$/i.exec(header);
    return m ? m[1] : undefined;
  }
}

/** Требования к паролю. Сложных правил намеренно нет: это доступ к своим
 *  записям на корт, а не к деньгам. Слишком строгие требования люди обходят
 *  паролем на бумажке. Шести знаков и защиты от подбора достаточно. */
export function checkClientPassword(pw: unknown): string {
  const p = String(pw ?? '');
  if (p.length < 6) throw new Error('Пароль не короче 6 знаков');
  if (p.length > 200) throw new Error('Пароль слишком длинный');
  return p;
}
