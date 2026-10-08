/** Подтверждение номера обратным звонком через SMS.ru.
 *
 *  Человек сам звонит со своего телефона на выданный номер 8-800, SMS.ru
 *  сбрасывает звонок и отмечает номер подтверждённым. Почему не код в SMS:
 *  операторы берут за буквенное имя отправителя 2 000–3 000 ₽ в месяц
 *  с каждого, плюс ~8,5 ₽ за сообщение; без имени коды просто не доходят
 *  (цены SMS.ru, проверено 08.10.2026). Обратный звонок — исходящий звонок
 *  человека, его не касается блокировка немаркированных звонков юрлиц,
 *  и сейчас он бесплатен. Так же сделано в соседнем проекте заказчика.
 *
 *  Документация: https://sms.ru/api/callcheck
 *    callcheck/add    {api_id, phone, ip, json=1} → {status, status_code,
 *                      check_id, call_phone, call_phone_pretty}
 *    callcheck/status {api_id, check_id, json=1}  → {check_status:
 *                      "400" ждём | "401" подтверждён | "402" истекло}
 *
 *  Ключ — SMSRU_API_ID в .env сервера. Без него подтверждение выключено:
 *  служба честно отвечает, что способ недоступен, и ничего не выдумывает.
 */
import { randomBytes } from 'crypto';

// Адрес можно подменить на стенде (как TELEGRAM_API_BASE у бота),
// чтобы проверять порядок входа, не обращаясь к SMS.ru
const BASE = (process.env.SMSRU_API_BASE ?? 'https://sms.ru/callcheck').replace(/\/$/, '');

/** Есть ли чем подтверждать номер: без ключа SMS.ru способ недоступен,
 *  и приложение не должно рисовать шаг, который не сработает. */
export const callCheckReady = () => !!(process.env.SMSRU_API_ID ?? '').trim();

export type AddResult =
  | { ok: true; checkId: string; callPhone: string; callPhonePretty: string }
  | { ok: false; reason: 'invalid_number' | 'provider_limit' | 'provider_error'; code: number };

export type StatusResult = 'confirmed' | 'waiting' | 'expired' | 'provider_error';

export interface CallCheckProvider {
  add(phone: string, ip: string | null): Promise<AddResult>;
  status(checkId: string): Promise<StatusResult>;
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 ? v : typeof v === 'number' ? String(v) : null;

/** Разбор callcheck/add. Номер в ответе бывает и `call_phone`, и `call_number` —
 *  в документации встречаются оба написания, принимаем любое. */
export function parseAdd(body: unknown): AddResult {
  const r = (body ?? {}) as Record<string, unknown>;
  const code = Number(r.status_code ?? 0);
  const checkId = str(r.check_id);
  const callPhone = (str(r.call_phone) ?? str(r.call_number))?.replace(/\D/g, '') ?? null;
  if (r.status === 'OK' && code === 100 && checkId && callPhone && /^\d{10,15}$/.test(callPhone)) {
    return {
      ok: true, checkId, callPhone,
      callPhonePretty: str(r.call_phone_pretty) ?? str(r.call_number_pretty) ?? `+${callPhone}`,
    };
  }
  // 202 — номер указан неверно; 201 — кончились деньги; 230–233 — лимиты SMS.ru
  if (code === 202) return { ok: false, reason: 'invalid_number', code };
  if (code === 201 || (code >= 230 && code <= 233)) return { ok: false, reason: 'provider_limit', code };
  return { ok: false, reason: 'provider_error', code };
}

/** Разбор callcheck/status: подтверждено — только явный 401. */
export function parseStatus(body: unknown): StatusResult {
  const r = (body ?? {}) as Record<string, unknown>;
  if (r.status !== 'OK') return 'provider_error';
  const s = str(r.check_status);
  return s === '401' ? 'confirmed' : s === '400' ? 'waiting' : s === '402' ? 'expired' : 'provider_error';
}

export class SmsRuCallCheck implements CallCheckProvider {
  constructor(private readonly apiId: string, private readonly fetchImpl: typeof fetch = fetch) {}

  private async post(path: string, params: Record<string, string>): Promise<unknown> {
    const res = await this.fetchImpl(`${BASE}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ api_id: this.apiId, json: '1', ...params }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`sms.ru ${res.status}`);
    return res.json();
  }

  async add(phone: string, ip: string | null): Promise<AddResult> {
    try {
      // IP человека: по нему SMS.ru видит роуминг и выдаёт обычный номер
      // вместо 8-800 — на 8-800 из-за границы не позвонить
      const params: Record<string, string> = { phone: phone.replace(/\D/g, '') };
      if (ip) params.ip = ip;
      return parseAdd(await this.post('add', params));
    } catch { return { ok: false, reason: 'provider_error', code: 0 } }
  }

  async status(checkId: string): Promise<StatusResult> {
    try { return parseStatus(await this.post('status', { check_id: checkId })) }
    catch { return 'provider_error' }
  }
}

/* ── учёт начатых проверок ───────────────────────────────────────────────
   Держим в памяти: проверка живёт пять минут, и перезапуск службы в худшем
   случае просит человека позвонить ещё раз. */

/** Сколько живёт выданный номер. */
const LIFE_MS = 5 * 60_000;
/** Не чаще одного запроса к SMS.ru на номер. */
const POLL_MS = 2_000;
/** Сколько живёт подтверждение до того, как им воспользуются. */
const TOKEN_MS = 15 * 60_000;
/** Новых проверок одного номера в сутки и с одного адреса в час. */
const PER_PHONE_DAY = 5, PER_IP_HOUR = 10;

export type Pending = {
  checkId: string; secret: string; callPhone: string; callPhonePretty: string;
  expiresAt: number; polledAt: number;
};

export const LIMIT_TEXT: Record<'phone' | 'ip', string> = {
  phone: 'Этот номер сегодня проверяли слишком часто. Попробуйте завтра или позвоните в клуб.',
  ip: 'Слишком много проверок подряд. Попробуйте через час.',
};

export class CallChecks {
  private pending = new Map<string, Pending>();
  private byPhone = new Map<string, number[]>();
  private byIp = new Map<string, number[]>();
  private tokens = new Map<string, { phone: string; expiresAt: number }>();

  /** Начатая и ещё живая проверка номера. */
  active(phone: string): Pending | null {
    const e = this.pending.get(phone);
    if (!e) return null;
    if (e.expiresAt <= Date.now()) { this.pending.delete(phone); return null }
    return e;
  }

  /** Та ли это вкладка, что начала проверку. Иначе чужой, опрашивая тот же
   *  номер, забрал бы подтверждение, когда владелец позвонит. */
  owns(e: Pending, secret?: string | null): boolean {
    return !!secret && secret === e.secret;
  }

  canStart(phone: string, ip: string | null): { ok: true } | { ok: false; reason: 'phone' | 'ip' } {
    const now = Date.now();
    const keep = (list: number[] | undefined, ms: number) => (list ?? []).filter(t => now - t < ms);
    const p = keep(this.byPhone.get(phone), 864e5);
    if (p.length >= PER_PHONE_DAY) return { ok: false, reason: 'phone' };
    if (ip) {
      const i = keep(this.byIp.get(ip), 3600_000);
      if (i.length >= PER_IP_HOUR) return { ok: false, reason: 'ip' };
    }
    return { ok: true };
  }

  countStart(phone: string, ip: string | null) {
    const now = Date.now();
    this.byPhone.set(phone, [...(this.byPhone.get(phone) ?? []), now]);
    if (ip) this.byIp.set(ip, [...(this.byIp.get(ip) ?? []), now]);
  }

  remember(phone: string, add: { checkId: string; callPhone: string; callPhonePretty: string }): Pending {
    const e: Pending = {
      ...add, secret: randomBytes(16).toString('hex'),
      expiresAt: Date.now() + LIFE_MS, polledAt: 0,
    };
    this.pending.set(phone, e);
    return e;
  }

  forget(phone: string) { this.pending.delete(phone) }

  /** Не дёргаем SMS.ru чаще, чем раз в две секунды на номер. */
  shouldPoll(e: Pending): boolean {
    const now = Date.now();
    if (now - e.polledAt < POLL_MS) return false;
    e.polledAt = now;
    return true;
  }

  /** Номер подтверждён — выдаём одноразовое подтверждение для регистрации. */
  confirm(phone: string): string {
    this.pending.delete(phone);
    const token = randomBytes(24).toString('hex');
    this.tokens.set(token, { phone, expiresAt: Date.now() + TOKEN_MS });
    return token;
  }

  /** Подтверждение годно и выдано на этот номер. */
  tokenValid(token: string | undefined | null, phone: string): boolean {
    const t = token ? this.tokens.get(token) : undefined;
    if (!t) return false;
    if (t.expiresAt <= Date.now()) { this.tokens.delete(token!); return false }
    return t.phone === phone;
  }

  /** Одноразовое: после регистрации подтверждение сгорает. */
  consume(token: string | undefined | null) { if (token) this.tokens.delete(token) }
}
