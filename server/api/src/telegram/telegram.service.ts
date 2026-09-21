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

/** Виды уведомлений.
 *
 *  `title` — полное название, его же видит владелец в админке.
 *  `short` — подпись на кнопке: кнопок шесть, в два столбца, поэтому одно слово.
 *  `about` — чем этот вид отличается от соседнего. Из одних названий разницу
 *  между «Оплатами» и «Продажами» не угадать, поэтому объяснение стоит
 *  в самом сообщении рядом со списком, а не прячется в справке. */
export const TG_KINDS = {
  booking: { col: 'on_booking', title: 'Новые брони',     short: 'Брони',
             about: 'заявка из приложения и запись со стойки' },
  cancel:  { col: 'on_cancel',  title: 'Отмены и неявки', short: 'Отмены',
             about: 'бронь отменили или гость не пришёл' },
  payment: { col: 'on_payment', title: 'Оплата броней',   short: 'Оплаты',
             about: 'деньги за корт и тренировку' },
  sale:    { col: 'on_sale',    title: 'Продажи в клубе', short: 'Продажи',
             about: 'мячи, вода, прокат — всё с кассы клуба' },
  refund:  { col: 'on_refund',  title: 'Возвраты денег',  short: 'Возвраты',
             about: 'деньги вернули клиенту' },
  daily:   { col: 'on_daily',   title: 'Итог за день',    short: 'Итог дня',
             about: 'одно сообщение после закрытия клуба' },
} as const;
export type TgKind = keyof typeof TG_KINDS;

/** Порядок в меню: сначала что происходит на кортах, потом деньги, потом отчёт.
 *  Внутри пары читается слева направо, как обычный список. */
export const TG_GROUPS: { title: string; kinds: TgKind[] }[] = [
  { title: 'На кортах', kinds: ['booking', 'cancel'] },
  { title: 'Деньги',    kinds: ['payment', 'sale', 'refund'] },
  { title: 'Отчёт',     kinds: ['daily'] },
];

/** Список видов с пояснениями — то, что человек читает перед кнопками. */
export function kindsLegend(): string {
  return TG_GROUPS.map(g => [`<b>${g.title}</b>`,
    ...g.kinds.map(k => `${TG_KINDS[k].short} — ${TG_KINDS[k].about}`)].join('\n')).join('\n\n');
}


/* ── как выглядят сообщения ──────────────────────────────────────────────
   Одно правило на все уведомления: строка-заголовок со значком и сутью,
   под ней главное (кто и на сколько), затем подробности по одной мысли
   в строку, и в конце — кто это сделал. Читается за секунду с экрана
   блокировки, без лишних слов и рамок. */

/** Экранирование по Bot API: символы `<`, `>` и `&`, которые не часть тега,
 *  Telegram не принимает — сообщение с именем вроде «Иса <Малыш> & Co»
 *  отклоняется с 400 и до руководителя не доходит вовсе.
 *  (Bot API, раздел HTML style; проверено 22.09.2026.)
 *  Через esc() проходит всё, что пришло от человека: имена, названия
 *  кортов и товаров, примечания, имя менеджера. */
export const esc = (v: unknown) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const money = (k: number) => (k / 100).toLocaleString('ru-RU') + ' ₽';

/** Телефон в читаемом виде и сразу кликабельный. */
export function phoneLink(phone?: string | null): string {
  if (!phone) return '';
  const d = String(phone).replace(/\D/g, '');
  const nice = d.length === 11
    ? `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`
    : '+' + d;
  return `<a href="tel:+${d}">${nice}</a>`;
}

/** Когда игра: «ср, 23 сент · 19:00–21:00». Год не пишем — он и так этот. */
export function whenLine(a: Date, b: Date): string {
  const day = a.toLocaleDateString('ru-RU',
    { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Moscow' });
  const t = (d: Date) => d.toLocaleTimeString('ru-RU',
    { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
  return `${day} · ${t(a)}–${t(b)}`;
}

type Line = string | false | null | undefined;

/** Сообщение из смысловых блоков: внутри блока строки идут подряд,
 *  между блоками — пустая строка. Пустые строки и целиком пустые блоки
 *  выбрасываются, чтобы от необязательных полей не оставалось дыр. */
export function tgBlocks(blocks: Line[][]): string {
  return blocks
    .map(b => (b.filter(Boolean) as string[]).join('\n'))
    .filter(Boolean)
    .join('\n\n');
}

/** Собрать уведомление о событии по общему образцу. */
export function tgMsg(p: {
  icon: string; title: string; amount?: number | null;
  head?: Line[];
  rows?: Line[];
  foot?: string | null;
}): string {
  const title = p.amount != null
    ? `${p.icon} <b>${p.title}</b> · <b>${money(p.amount)}</b>`
    : `${p.icon} <b>${p.title}</b>`;
  return tgBlocks([[title, ...(p.head ?? [])], p.rows ?? [], [p.foot && `<i>${esc(p.foot)}</i>`]]);
}

/** Вёрстка итога дня. Чистая: на вход — уже посчитанные числа,
 *  на выход — готовое сообщение. Так её видно в тестах и превью. */
export function dayReportText(p: {
  date: string; games: number; cancelled: number; noShow: number;
  charged: number; shop: number; got: number;
  byMethod: readonly (readonly [string, number])[]; refunded: number;
}): string {
  const d = new Date(p.date + 'T00:00:00Z').toLocaleDateString('ru-RU',
    { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const head = ['📊 <b>Итог дня</b>', `📅 ${d}`];

  // Тихий день не разворачиваем в столбик нулей
  if (!p.games && !p.cancelled && !p.noShow && !p.got && !p.shop && !p.refunded) {
    return tgBlocks([head, ['За день ничего не было: ни игр, ни продаж.']]);
  }

  const MW: Record<string, string> = { cash: 'наличными', card: 'картой', transfer: 'переводом' };
  const left = Math.max(0, p.charged - p.got);
  const money_moved = p.charged > 0 || p.shop > 0 || p.got > 0 || p.refunded > 0;

  // Одна мысль в строку, со своим значком; блоки читаются сверху вниз:
  // сколько сыграли → сколько начислили → сколько взяли и чем → что за клиентами.
  // Блок с нулями не печатаем: строка «Получено: 0 ₽» ничего не сообщает,
  // а день из одних отмен выглядел отчётом об успешном закрытии расчётов.
  return tgBlocks([
    head,
    [
      p.games > 0 ? `🎾 Игры: <b>${p.games}</b>` : '🎾 Игр не было',
      p.cancelled > 0 && `🚫 Отмены: ${p.cancelled}`,
      p.noShow > 0 && `⚠️ Неявки: ${p.noShow}`,
    ],
    [
      p.charged > 0 && `📈 Начислено: <b>${money(p.charged)}</b>`,
      p.shop > 0 && `🛒 Продажи: <b>${money(p.shop)}</b>`,
    ],
    [
      p.got > 0 && `💵 Получено: <b>${money(p.got)}</b>`,
      ...(p.got > 0 ? p.byMethod.map(([m, sum]) => `— ${MW[m]} ${money(sum)}`) : []),
      p.refunded > 0 && `↩️ Возвраты: −${money(p.refunded)}`,
      p.refunded > 0 && p.got > 0 && `🧾 Чистыми: <b>${money(p.got - p.refunded)}</b>`,
    ],
    [!money_moved
      ? '💰 Денег за день не было'
      : left > 0
        ? `⏳ Не оплачено: <b>${money(left)}</b>`
        : '✅ По играм расчёт закрыт'],
  ]);
}

const API = (process.env.TELEGRAM_API_BASE ?? 'https://api.telegram.org/bot').replace(/\/$/, '');

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
      const subs = await this.db.tg_subs.findMany({
        where: { is_active: true, approved: true, [col]: true } as any });
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
      const okSub = await this.db.tg_subs.findUnique({ where: { chat_id: chat } });
      if (!okSub?.approved) {
        await this.api('answerCallbackQuery', { callback_query_id: q.id,
          text: 'Отчёты включает руководитель клуба', show_alert: true });
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
      const was = await this.db.tg_subs.findUnique({ where: { chat_id: chat } });
      // Разрешение даёт клуб: либо ссылкой-приглашением из админки,
      // либо кнопкой «Разрешить» рядом с этим ID
      const approved = !!adminId || !!was?.approved;
      const s = await this.db.tg_subs.upsert({
        where: { chat_id: chat },
        update: { is_active: true, name, approved, ...(adminId ? { admin_id: adminId } : {}) },
        create: { chat_id: chat, name, admin_id: adminId, approved },
      });
      if (!approved) {
        await this.send(chat,
          `<b>Magas Padel</b>\n\nВаш ID: <code>${chat}</code>\n\n`
          + 'Отчёты клуба приходят только тем, кого добавил руководитель. '
          + 'Передайте ему этот ID — и уведомления включатся.');
        return;
      }
      await this.send(chat, this.menuText(
        `<b>Magas Padel</b>\nУведомления включены${adminName ? ` для ${esc(adminName)}` : ''}.`),
        this.keyboard(s));
      return;
    }

    const sub = await this.db.tg_subs.findUnique({ where: { chat_id: chat } });
    if (!sub?.approved) {
      await this.send(chat, `Ваш ID: <code>${chat}</code>\nПередайте его руководителю клуба — он включит отчёты.`);
      return;
    }

    if (/^\/(today|day|итог)\b/i.test(text)) { await this.send(chat, await this.dayReport(clubToday())); return }
    if (/^\/(yesterday|вчера)\b/i.test(text)) { await this.send(chat, await this.dayReport(shiftDate(clubToday(), -1))); return }

    if (/^\/(settings|help|menu)\b/.test(text)) {
      const s = await this.db.tg_subs.findUnique({ where: { chat_id: chat } });
      if (!s) { await this.send(chat, 'Нажмите /start, чтобы получать уведомления.'); return }
      await this.send(chat, this.menuText('<b>Что присылать в этот чат</b>'), this.keyboard(s));
      return;
    }

    await this.send(chat, [
      '<b>Команды</b>',
      '/settings — что присылать',
      '/today — итог за сегодня',
      '/yesterday — итог за вчера',
      '/stop — выключить уведомления',
    ].join('\n'));
  }

  /** Текст над кнопками: сначала зачем это сообщение, потом список видов
   *  с пояснениями, в конце — что делать. Пояснения нужны затем, что
   *  «Оплаты» и «Продажи» или «Возвраты» и «Отмены» по названию неразличимы. */
  private menuText(head: string) {
    return [head, kindsLegend(), '<i>Галочка — присылаю. Нажмите, чтобы включить или выключить.</i>'].join('\n\n');
  }

  /** Кнопки-переключатели: галочка показывает, что включено, нажатие меняет.
   *  По две в ряд — шесть кнопок в столбик занимали пол-экрана и читались
   *  как длинный непонятный список. Подписи короткие, потому что смысл
   *  каждой уже объяснён в тексте над кнопками. */
  private keyboard(s: any) {
    const btn = (k: TgKind) => ({
      text: `${(s as any)[TG_KINDS[k].col] ? '✅' : '○'} ${TG_KINDS[k].short}`,
      callback_data: `t:${k}`,
    });
    const pairs: TgKind[][] = [['booking', 'cancel'], ['payment', 'sale'], ['refund', 'daily']];
    return { inline_keyboard: [
      ...pairs.map(p => p.map(btn)),
      [{ text: '📊 Показать итог за сегодня', callback_data: 'today' }],
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
    const shop = sales.reduce((n, x) => n + x.amount, 0);
    const refunded = refunds.reduce((n, x) => n + x.amount, 0);

    return dayReportText({
      date, games: live.length, cancelled, noShow, charged, shop, got, byMethod, refunded,
    });
  }
}
