/** Вход сотрудников: пароли, сессии, права, журнал действий.
 *
 *  Для входа пароль проверяется по scrypt-хэшу с индивидуальной солью.
 *  Владелец клуба попросил видеть пароли сотрудников (19.09.2026), поэтому
 *  рядом лежит копия, зашифрованная AES-256-GCM ключом STAFF_PASS_KEY.
 *  Ключ живёт только в .env сервера, не в базе: копия базы без ключа
 *  паролей не раскрывает. Расшифровать может только владелец, и каждый
 *  просмотр пишется в журнал. В лог пароль не пишется никогда.
 */
import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual, createHash, createCipheriv, createDecipheriv, randomInt } from 'crypto';
import { promisify } from 'util';
import { PrismaService } from '../prisma/prisma.service';

const scryptAsync = promisify(scrypt) as (
  pw: string | Buffer, salt: Buffer, len: number) => Promise<Buffer>;

const KEY_LEN = 64;

/** Защита от подбора пароля.
 *
 *  Репозиторий открыт, значит адрес админки и форма входа известны всем.
 *  Без ограничения пароль из восьми знаков перебирается скриптом за вечер.
 *  Считаем неудачные попытки и запираем — отдельно по логину и по адресу,
 *  с которого стучатся: иначе перебор либо одного логина, либо всех подряд
 *  останется возможным. */
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
/** Через сколько без попыток счётчик забывается. */
const FORGET_MINUTES = 30;
/** Сколько живёт вход без повторного пароля. */
const SESSION_DAYS = 30;

/** Права, которые владелец выдаёт сотрудникам.
 *  Смотреть день и записывать клиентов может любой вошедший — это работа стойки.
 *  Всё, что ниже, нужно разрешать отдельно. */
export const PERMS = {
  cancel: 'Отменять брони и отмечать неявку',
  refunds: 'Возвращать деньги',
  prices: 'Цены, скидки и расходы',
  analytics: 'Видеть историю, выручку и аналитику',
  clients: 'Клиенты и рассылки уведомлений',
  club: 'Площадки, часы работы, правила',
  tournaments: 'Турниры',
  staff: 'Сотрудники и их права',
  stock: 'Склад: приход, списание и пересчёт товаров',
} as const;

/** Ключ шифрования копий паролей: 64 hex-знака в STAFF_PASS_KEY. */
function passKey(): Buffer | null {
  const hex = process.env.STAFF_PASS_KEY ?? '';
  return /^[0-9a-f]{64}$/i.test(hex) ? Buffer.from(hex, 'hex') : null;
}
/** Зашифровать пароль: iv(12) | tag(16) | шифртекст — в base64. */
export function sealPassword(pw: string): string | null {
  const key = passKey(); if (!key) return null;
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(pw, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
export function openPassword(sealed: string | null | undefined): string | null {
  const key = passKey(); if (!key || !sealed) return null;
  try {
    const buf = Buffer.from(sealed, 'base64');
    const d = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
  } catch { return null }
}
/** Пароль, который легко продиктовать: «корт-7kpm-42» латиницей —
 *  три части, буквы без похожих (l/1, o/0), обязательно есть цифры. */
export function makePassword(): string {
  const L = 'abcdefghjkmnpqrstuvwxyz', D = '23456789';
  const pick = (a: string, n: number) => Array.from({ length: n }, () => a[randomInt(a.length)]).join('');
  return `padel-${pick(L, 4)}-${pick(D, 2)}${pick(L, 2)}`;
}

export type Perm = keyof typeof PERMS;

export type Admin = {
  id: number;
  login: string;
  name: string;
  role: 'owner' | 'staff';
  perms: Perm[];
  isActive: boolean;
};

/** Счётчик неудачных попыток входа. */
type Fails = { count: number; last: number; until: number };

@Injectable()
export class AuthService {
  constructor(private readonly db: PrismaService) {}

  /** Живёт в памяти: перезапуск сервера обнуляет счётчики, и это допустимо —
   *  перебор всё равно не успеет пройти между перезапусками. */
  private fails = new Map<string, Fails>();

  /** Сколько секунд осталось до конца блокировки. 0 — не заперто. */
  lockedFor(keys: string[]): number {
    const now = Date.now();
    let left = 0;
    for (const k of keys) {
      const f = this.fails.get(k);
      if (f && f.until > now) left = Math.max(left, Math.ceil((f.until - now) / 1000));
    }
    return left;
  }

  /** Отметить неудачную попытку и, если их слишком много, запереть. */
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
    this.sweep(now);
  }

  /** Удачный вход снимает счётчики. */
  clearFails(keys: string[]): void {
    for (const k of keys) this.fails.delete(k);
  }

  /** Чтобы карта не росла бесконечно от чужих попыток. */
  private sweep(now: number): void {
    if (this.fails.size < 500) return;
    for (const [k, f] of this.fails) {
      if (now - f.last > FORGET_MINUTES * 60_000 && f.until < now) this.fails.delete(k);
    }
  }

  /** Хэш пароля: соль и ключ через двоеточие. */
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await scryptAsync(password, salt, KEY_LEN);
    return `${salt.toString('hex')}:${key.toString('hex')}`;
  }

  /** Сверка пароля. Сравнение постоянное по времени — иначе по задержке
   *  ответа можно подбирать хэш побайтно. */
  async verify(password: string, stored: string): Promise<boolean> {
    const [saltHex, keyHex] = stored.split(':');
    if (!saltHex || !keyHex) return false;
    const key = await scryptAsync(password, Buffer.from(saltHex, 'hex'), KEY_LEN);
    const want = Buffer.from(keyHex, 'hex');
    return key.length === want.length && timingSafeEqual(key, want);
  }

  /** В базе хранится отпечаток токена, а не сам токен. */
  private fingerprint(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Проверить логин и пароль. Возвращает токен входа или null. */
  async login(login: string, password: string): Promise<{ token: string; admin: Admin } | null> {
    const row = await this.db.admins.findUnique({ where: { login: login.trim().toLowerCase() } });
    if (!row || !row.is_active) return null;
    if (!(await this.verify(password, row.password_hash))) return null;

    const token = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
    await this.db.admin_sessions.create({
      data: { token_hash: this.fingerprint(token), admin_id: row.id, expires_at: expires },
    });
    await this.db.admins.update({
      where: { id: row.id }, data: { last_login_at: new Date() },
    });
    return { token, admin: toAdmin(row) };
  }

  /** Кто пришёл с этим токеном. null — токена нет, истёк или сотрудник выключен. */
  async whoIs(token: string | undefined): Promise<Admin | null> {
    if (!token) return null;
    const s = await this.db.admin_sessions.findUnique({
      where: { token_hash: this.fingerprint(token) },
      include: { admins: true },
    });
    if (!s || s.expires_at < new Date() || !s.admins.is_active) return null;

    // Продлеваем вход, но не чаще раза в час: иначе запись в базу на каждый запрос
    if (Date.now() - +s.last_seen > 3600_000) {
      await this.db.admin_sessions.update({
        where: { token_hash: s.token_hash },
        data: { last_seen: new Date(), expires_at: new Date(Date.now() + SESSION_DAYS * 864e5) },
      });
    }
    return toAdmin(s.admins);
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.db.admin_sessions.deleteMany({ where: { token_hash: this.fingerprint(token) } });
  }

  /** Все входы сотрудника закрываются: сняли права — доступ пропал сразу. */
  async dropSessions(adminId: number): Promise<void> {
    await this.db.admin_sessions.deleteMany({ where: { admin_id: BigInt(adminId) } });
  }

  /** Есть ли право. У владельца есть всё. */
  can(admin: Admin, perm: Perm): boolean {
    return admin.role === 'owner' || admin.perms.includes(perm);
  }

  /** Запись в журнал. Пишем имя строкой: сотрудника могут потом удалить,
   *  а запись «кто отменил бронь» должна остаться читаемой. */
  async log(admin: Admin | null, action: string, details?: string): Promise<void> {
    await this.db.admin_log.create({ data: {
      admin_id: admin ? BigInt(admin.id) : null,
      admin_name: admin?.name ?? 'неизвестно',
      action,
      details: details?.slice(0, 500) ?? null,
    }});
  }
}

function toAdmin(row: {
  id: bigint; login: string; name: string; role: string;
  perms: string[]; is_active: boolean;
}): Admin {
  return {
    id: Number(row.id),
    login: row.login,
    name: row.name,
    role: row.role === 'owner' ? 'owner' : 'staff',
    perms: row.perms.filter((p): p is Perm => p in PERMS),
    isActive: row.is_active,
  };
}
