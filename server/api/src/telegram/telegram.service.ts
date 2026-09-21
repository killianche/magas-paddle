/** Уведомления руководителю в Telegram.
 *
 *  Решение заказчика 21.09.2026: каждая бронь, оплата, продажа, возврат и
 *  отмена приходят в Telegram, плюс итог за день. Подписаться может любой,
 *  кто открыл бота и нажал «Старт»; владелец видит список подписчиков
 *  в админке и может выключить любого. Что именно получать, человек
 *  настраивает прямо в боте кнопками — уведомления о каждой оплате
 *  отключаются отдельно от итога за день.
 *
 *  Токен бота лежит в .env сервера (TELEGRAM_BOT_TOKEN). Без него служба
 *  молчит: ничего не шлёт и не опрашивает Telegram.
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClubService, hoursOn } from '../club';
import { clubToday, clubHour, shiftDate } from '../time';

/** Виды уведомлений: колонка в tg_subs и подпись для кнопки. */
export const TG_KINDS = {
  booking: { col: 'on_booking', title: 'Новые брони' },
  payment: { col: 'on_payment', title: 'Оплаты' },
  sale:    { col: 'on_sale',    title: 'Продажи' },
  refund:  { col: 'on_refund',  title: 'Возвраты' },
  cancel:  { col: 'on_cancel',  title: 'Отмены и неявки' },
  daily:   { col: 'on_daily',   title: 'Итог за день' },
} as const;
export type TgKind = keyof typeof TG_KINDS;

const API = (process.env.TELEGRAM_API_BASE ?? 'https://api.telegram.org/bot').replace(/\/$/, '');
const rub = (k: number) => (k / 100).toLocaleString('ru-RU') + ' ₽';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Telegram');
  private readonly token = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
  private poll: NodeJS.Timeout | null = null;
  private daily: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(private readonly db: PrismaService, private readonly club: ClubService) {}

  get on() { return !!this.token }

  onModuleInit() {
    if (!this.on) { this.log.warn('TELEGRAM_BOT_TOKEN не задан — уведомления выключены'); return }
    this.loop();
    // Итог за день отправляется после закрытия клуба; проверяем раз в минуту
    this.daily = setInterval(() => this.maybeDaily().catch(() => {}), 60_000);
    this.log.log('Уведомления в Telegram включены');
  }
  onModuleDestroy() {
    this.stopped = true;
    if (this.poll) clearTimeout(this.poll);
    if (this.daily) clearInterval(this.daily);
  }

  /* ── отправка ───────────────────────────────────────────────────────── */

  private async api(method: string, body: any) {
    const r = await fetch(`${API}${this.token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return r.json() as Promise<any>;
  }

  async send(chatId: bigint | number, text: string, keyboard?: any) {
    if (!this.on) return;
    try {
      const r = await this.api('sendMessage', {
        chat_id: Number(chatId), text, parse_mode: 'HTML', disable_web_page_preview: true,
        ...(keyboard ? { reply_markup: keyboard } : {}),
      });
      // Человек заблокировал бота — больше не пишем
      if (r?.ok === false && /blocked|chat not found|deactivated/i.test(r?.description ?? '')) {
        await this.db.tg_subs.updateMany({ where: { chat_id: BigInt(chatId) }, data: { is_active: false } });
      }
    } catch (e: any) { this.log.warn('не отправилось: ' + e?.message) }
  }

  /** Разослать всем, у кого этот вид уведомлений включён. */
  async notify(kind: TgKind, text: string) {
    if (!this.on) return;
    const col = TG_KINDS[kind].col;
    try {
      const subs = await this.db.tg_subs.findMany({ where: { is_active: true, [col]: true } as any });
      for (const s of subs) await this.send(s.chat_id, text);
    } catch (e: any) { this.log.warn('рассылка не прошла: ' + e?.message) }
  }

  /* ── приём сообщений ────────────────────────────────────────────────── */

  private async loop() {
    while (!this.stopped) {
      try {
        const set = await this.db.settings.findUnique({ where: { id: 1 } });
        const offset = set?.tg_offset ? Number(set.tg_offset) + 1 : undefined;
        const r = await this.api('getUpdates', { timeout: 25, offset, allowed_updates: ['message', 'callback_query'] });
        const list: any[] = r?.result ?? [];
        for (const u of list) {
          try { await this.handle(u) } catch (e: any) { this.log.warn('апдейт: ' + e?.message) }
        }
        if (list.length) {
          await this.db.settings.update({ where: { id: 1 },
            data: { tg_offset: BigInt(list[list.length - 1].update_id) } });
        }
      } catch (e: any) {
        this.log.warn('опрос: ' + e?.message);
        await new Promise(res => setTimeout(res, 5_000));
      }
    }
  }

  private async handle(u: any) {
    if (u.callback_query) {
      const q = u.callback_query;
      const chat = BigInt(q.message?.chat?.id ?? 0);
      const data = String(q.data ?? '');
      if (data === 'today') {
        await this.api('answerCallbackQuery', { callback_query_id: q.id });
        await this.send(chat, await this.dayReport(clubToday()));
        return;
      }
      if (data.startsWith('t:')) {
        const kind = data.slice(2) as TgKind;
        const col = TG_KINDS[kind]?.col;
        if (col) {
          const s = await this.db.tg_subs.findUnique({ where: { chat_id: chat } });
          if (s) {
            await this.db.tg_subs.update({ where: { chat_id: chat }, data: { [col]: !(s as any)[col] } as any });
          }
        }
        await this.api('answerCallbackQuery', { callback_query_id: q.id });
        const s2 = await this.db.tg_subs.findUnique({ where: { chat_id: chat } });
        if (s2) {
          await this.api('editMessageReplyMarkup', {
            chat_id: Number(chat), message_id: q.message.message_id,
            reply_markup: this.keyboard(s2),
          });
        }
        return;
      }
      await this.api('answerCallbackQuery', { callback_query_id: q.id });
      return;
    }

    const m = u.message;
    if (!m?.chat?.id) return;
    const chat = BigInt(m.chat.id);
    const text = String(m.text ?? '').trim();
    const name = [m.chat.first_name, m.chat.last_name].filter(Boolean).join(' ')
      || m.chat.username || m.chat.title || null;

    if (/^\/stop\b/.test(text)) {
      await this.db.tg_subs.updateMany({ where: { chat_id: chat }, data: { is_active: false } });
      await this.send(chat, 'Уведомления выключены. Чтобы включить снова — /start.');
      return;
    }

    if (/^\/start\b/.test(text)) {
      const code = text.split(/\s+/)[1];
      let adminId: bigint | null = null, adminName: string | null = null;
      if (code) {
        const row = await this.db.tg_codes.findUnique({ where: { code } });
        if (row && row.expires_at > new Date()) {
          adminId = row.admin_id ?? null; adminName = row.admin_name ?? null;
          await this.db.tg_codes.delete({ where: { code } }).catch(() => {});
        }
      }
      const s = await this.db.tg_subs.upsert({
        where: { chat_id: chat },
        update: { is_active: true, name, ...(adminId ? { admin_id: adminId } : {}) },
        create: { chat_id: chat, name, admin_id: adminId },
      });
      await this.send(chat,
        `<b>Magas Padel</b>\nУведомления включены${adminName ? ` для ${adminName}` : ''}.\n\n`
        + 'Буду присылать новые брони, оплаты, продажи, возвраты, отмены и итог за день. '
        + 'Ниже можно выключить всё лишнее — например оставить только итог за день.',
        this.keyboard(s));
      return;
    }

    if (/^\/(today|day|итог)\b/i.test(text)) { await this.send(chat, await this.dayReport(clubToday())); return }
    if (/^\/(yesterday|вчера)\b/i.test(text)) { await this.send(chat, await this.dayReport(shiftDate(clubToday(), -1))); return }

    if (/^\/(settings|help|menu)\b/.test(text)) {
      const s = await this.db.tg_subs.findUnique({ where: { chat_id: chat } });
      if (!s) { await this.send(chat, 'Нажмите /start, чтобы получать уведомления.'); return }
      await this.send(chat, 'Что присылать:', this.keyboard(s));
      return;
    }

    await this.send(chat, 'Команды: /start — включить, /stop — выключить, /settings — что присылать, '
      + '/today — итог за сегодня, /yesterday — за вчера.');
  }

  /** Кнопки-переключатели: видно, что включено, одно нажатие — меняет. */
  private keyboard(s: any) {
    const row = (k: TgKind) => ([{
      text: `${(s as any)[TG_KINDS[k].col] ? '✅' : '⬜️'} ${TG_KINDS[k].title}`,
      callback_data: `t:${k}`,
    }]);
    return { inline_keyboard: [
      row('booking'), row('payment'), row('sale'), row('refund'), row('cancel'), row('daily'),
      [{ text: '📊 Итог за сегодня', callback_data: 'today' }],
    ]};
  }

  /* ── итог за день ───────────────────────────────────────────────────── */

  /** Отправляем один раз за день, после закрытия клуба. */
  private async maybeDaily() {
    if (!this.on) return;
    const set = await this.club.get();
    const today = clubToday();
    const row = await this.db.settings.findUnique({ where: { id: 1 } });
    if (row?.tg_daily_at === today) return;
    const day = hoursOn(set, today);
    const closeAt = day.closed ? clubHour(today, 21) : clubHour(today, Math.min(23, day.close));
    if (Date.now() < +closeAt) return;
    await this.db.settings.update({ where: { id: 1 }, data: { tg_daily_at: today } });
    await this.notify('daily', await this.dayReport(today));
  }

  /** Сводка за день: сколько сыграли, сколько получили и чем, что осталось. */
  async dayReport(date: string): Promise<string> {
    const from = clubHour(date, 0), to = clubHour(shiftDate(date, 1), 0);
    const [bookings, pays, sales, refunds] = await Promise.all([
      this.db.bookings.findMany({ where: { starts_at: { gte: from, lt: to } },
        select: { id: true, status: true, price: true, coach_price: true, discount: true, tournament_id: true } }),
      this.db.payments.findMany({ where: { created_at: { gte: from, lt: to } },
        select: { amount: true, method: true, kind: true } }),
      this.db.sales.findMany({ where: { day: new Date(date), method: { not: 'bill' } },
        select: { amount: true } }),
      this.db.refunds.findMany({ where: { created_at: { gte: from, lt: to } },
        select: { amount: true, item: true } }),
    ]);

    const live = bookings.filter(b => !b.tournament_id && !['cancelled', 'expired'].includes(b.status));
    const cancelled = bookings.filter(b => b.status === 'cancelled').length;
    const noShow = bookings.filter(b => b.status === 'no_show').length;
    const charged = live.reduce((n, b) => n + Math.max(0, b.price + b.coach_price - b.discount), 0);

    // Получено — только приход; возвраты считаем по журналу возвратов,
    // иначе возврат по броне попадал бы в сумму дважды: и минусом в платежах,
    // и строкой в refunds
    const got = pays.filter(p => p.amount > 0).reduce((n, p) => n + p.amount, 0);
    const byMethod = ['cash', 'card', 'transfer'].map(m => [m,
      pays.filter(p => p.method === m && p.amount > 0).reduce((n, p) => n + p.amount, 0)] as const)
      .filter(([, sum]) => sum !== 0);
    const MW: Record<string, string> = { cash: 'наличными', card: 'картой', transfer: 'переводом' };
    const shop = sales.reduce((n, x) => n + x.amount, 0);
    const refunded = refunds.reduce((n, x) => n + x.amount, 0);

    const d = new Date(date + 'T00:00:00Z').toLocaleDateString('ru-RU',
      { day: 'numeric', month: 'long', weekday: 'short', timeZone: 'UTC' });

    return [
      `<b>Итог за ${d}</b>`,
      '',
      `Игр: <b>${live.length}</b>${cancelled ? `, отмен: ${cancelled}` : ''}${noShow ? `, неявок: ${noShow}` : ''}`,
      `Начислено за корты и тренировки: <b>${rub(charged)}</b>`,
      `Продажи в кассе: <b>${rub(shop)}</b>`,
      '',
      `Получено: <b>${rub(got)}</b>`,
      ...byMethod.map(([m, sum]) => `   ${MW[m]}: ${rub(sum)}`),
      ...(refunded ? [`Возвращено: <b>${rub(refunded)}</b>`] : []),
      `Не оплачено по состоявшимся: <b>${rub(Math.max(0, charged - got))}</b>`,
    ].join('\n');
  }
}
