import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get,
  Headers, HttpException, NotFoundException, Param, Post, Query, Req, UnauthorizedException,
} from '@nestjs/common';
import { ipOf, limitRate } from '../ratelimit';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto';
import { ClubService, hoursOn } from '../club';
import { normalizePhone, bigId } from '../phone';
import { ClientAuthService } from '../clients/client-auth.service';
import { clubHour, clubToday, hourOf, isValidDate, shiftDate, weekdayOf } from '../time';
import { coachHours, coachBusyByClass } from '../coaches/coach.util';

/** Защита от ботов (решение заказчика 17.09.2026): не больше 3 неподтверждённых
 *  заявок на номер, запись не дальше 30 дней вперёд, не больше 10 заявок в час
 *  с одного адреса. */
export const MAX_PENDING_PER_PHONE = 3;
export const DAYS_AHEAD = 30;
/** С одного адреса в час. Мобильные операторы дают общий адрес на много людей,
 *  поэтому считаем только принятые заявки, а не каждую попытку. */
export const REQUESTS_PER_HOUR = 30;

/** Код PostgreSQL для нарушения exclusion-ограничения: время уже занято. */
const EXCLUSION_VIOLATION = '23P01';

@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly db: PrismaService,
    private readonly club: ClubService,
    private readonly auth: ClientAuthService,
  ) {}

  /** Кто спрашивает.
   *
   *  Сначала токен входа. Если его нет — по номеру, но только для аккаунтов
   *  без пароля: иначе чужой номер снова открывал бы чужие записи. Так же
   *  продолжают работать версии приложения, разосланные до появления пароля.
   */
  /** Кто спрашивает. Только по входу в аккаунт: раньше хватало номера телефона,
   *  и чужие записи мог посмотреть и отменить любой, кто знает номер. */
  private async whose(header: string | undefined, _phone?: string) {
    const byToken = await this.auth.whoIs(this.auth.tokenOf(header));
    if (!byToken) throw new UnauthorizedException('Войдите в аккаунт');
    return byToken;
  }

  /** Записи одного человека. */
  @Get()
  async list(@Query('phone') phone?: string, @Headers('authorization') header?: string) {
    const client = await this.whose(header, phone);
    if (!client) return [];

    // Сначала освобождаем просроченные заявки: иначе человек увидит
    // «ждёт подтверждения» у брони, которую клуб уже отпустил.
    await this.club.releaseExpired();

    // Отменённые тоже показываем: клуб мог отменить бронь, и человек должен
    // это увидеть, а не обнаружить, что запись просто пропала. Старые отмены
    // не копим — только свежие и будущие.
    const rows = await this.db.bookings.findMany({
      where: { client_id: client.id, OR: [
        { status: { in: ['pending', 'confirmed', 'done'] } },
        // Отменённые, сгоревшие и неявки показываем неделю, потом убираем
        { status: { in: ['cancelled', 'expired', 'no_show'] }, ends_at: { gt: new Date(Date.now() - 7 * 864e5) } },
      ] },
      orderBy: { starts_at: 'asc' },
      include: { coaches: { select: { name: true } } },
    });
    const courts = new Map((await this.db.courts.findMany()).map(c => [c.id, c.name]));
    // Строки счёта (прокат, мячи) и внесённые деньги — человек видит, сколько
    // должен и за что, теми же цифрами, что и менеджер
    const ids = rows.map(r => r.id);
    const [extras, paid, refunds] = ids.length ? await Promise.all([
      this.db.sales.findMany({ where: { booking_id: { in: ids } }, orderBy: { id: 'asc' } }),
      this.db.payments.groupBy({ by: ['booking_id'], where: { booking_id: { in: ids } }, _sum: { amount: true } }),
      this.db.payments.groupBy({ by: ['booking_id'], where: { booking_id: { in: ids }, kind: 'refund' }, _sum: { amount: true } }),
    ]) : [[], [], []];
    const paidBy = new Map(paid.map(p => [String(p.booking_id), p._sum.amount ?? 0]));
    const refundBy = new Map(refunds.map(p => [String(p.booking_id), -(p._sum.amount ?? 0)]));

    return rows.map(b => ({
      id: Number(b.id),
      // Отменил клуб, а не сам человек: в приложении это видно отдельной строкой
      cancelledByClub: b.status === 'cancelled' && !(b.status_by ?? '').startsWith('client'),
      courtId: b.court_id,
      courtName: courts.get(b.court_id) ?? b.court_id,
      startsAt: b.starts_at,
      endsAt: b.ends_at,
      hour: hourOf(b.starts_at),
      hours: Math.round((+b.ends_at - +b.starts_at) / 3600_000),
      price: b.price,
      // Тренировка: имя тренера и его часть цены
      coachName: b.coaches?.name ?? null, coachPrice: b.coach_price,
      discount: b.discount,
      paid: paidBy.get(String(b.id)) ?? 0,
      // Отмена или неявка: предоплата осталась клубу или её вернули
      keptPrepay: b.kept_prepay,
      refunded: refundBy.get(String(b.id)) ?? 0,
      extras: extras.filter(x => x.booking_id === b.id)
        .map(x => ({ item: x.item ?? x.category, qty: x.qty, amount: x.amount })),
      status: b.status,
      holdUntil: b.hold_until,
    }));
  }

  @Post()
  async create(@Req() req: any, @Body() dto: CreateBookingDto,
               @Headers('authorization') header?: string) {
    // Заявку оставляет только вошедший: так бронь привязана к настоящему
    // аккаунту, а чужой номер нельзя ни занять, ни переименовать
    const me = await this.auth.whoIs(this.auth.tokenOf(header));
    if (!me) throw new UnauthorizedException('Войдите в аккаунт, чтобы записаться');
    if (!isValidDate(dto.date)) throw new BadRequestException('Неверная дата');
    const bookingPhone = me.phone;
    if (dto.date > shiftDate(clubToday(), DAYS_AHEAD)) {
      throw new BadRequestException(`Записаться можно не дальше чем на ${DAYS_AHEAD} дней вперёд`);
    }
    await this.club.releaseExpired();
    const pricing = await this.club.pricing();
    const set = pricing.settings;
    const dh = hoursOn(set, dto.date);
    if (dh.closed) throw new BadRequestException('В этот день клуб не работает');
    if (dto.hour < dh.open || dto.hour + dto.hours > dh.close) {
      throw new BadRequestException(`В этот день клуб работает с ${dh.open}:00 до ${dh.close}:00`);
    }
    if (dto.hours > set.maxHours) {
      throw new BadRequestException(`Больше ${set.maxHours} часов подряд занять нельзя`);
    }

    const court = await this.db.courts.findUnique({ where: { id: dto.courtId } });
    if (!court || !court.is_active) throw new NotFoundException('Площадка не найдена');
    // Сравниваем с временем игры, а не с «сейчас»: корт, закрытый до завтра,
    // на следующей неделе снова доступен
    if (court.closed_until && court.closed_until > clubHour(dto.date, dto.hour)) {
      throw new ConflictException({ code: 'court_closed', message: court.closed_reason ?? 'Площадка закрыта' });
    }

    const startsAt = clubHour(dto.date, dto.hour);
    const endsAt = clubHour(dto.date, dto.hour + dto.hours);
    if (startsAt < new Date()) throw new BadRequestException('Это время уже прошло');
    // Лимит — после всех проверок: отклонённые попытки не в счёт
    limitRate(`book:${ipOf(req)}`, REQUESTS_PER_HOUR, 3600_000,
      'Слишком много заявок подряд. Попробуйте через час или позвоните в клуб');

    // Цена складывается по часам: часы могут попадать под разные тарифы
    let price = pricing.span(court, weekdayOf(dto.date), dto.hour, dto.hours);

    // Галочка «играть с тренером»: тренер должен работать в эти часы и быть
    // свободен. Занятость проверяем и по броням, и по группам — группа держит
    // корт отдельной бронью, без тренера. Окончательно тренера подтверждает
    // менеджер: если не сможет, предложит другого.
    let coach: { id: bigint; name: string; price: number; court_extra: boolean } | null = null;
    let coachPrice = 0;
    if (dto.coachId) {
      if (!set.coachesOn) throw new BadRequestException('Запись к тренеру сейчас недоступна');
      const c = await this.db.coaches.findUnique({ where: { id: BigInt(dto.coachId) } });
      if (!c || !c.is_active || !c.in_app) throw new NotFoundException('Тренер не найден');
      const wh = coachHours(c, set, dto.date);
      if (!wh || dto.hour < wh.open || dto.hour + dto.hours > wh.close) {
        throw new ConflictException({ code: 'coach_busy', message: `${c.name} в это время не работает` });
      }
      const taken = await this.db.bookings.count({ where: { coach_id: c.id,
        status: { notIn: ['cancelled', 'expired'] }, starts_at: { lt: endsAt }, ends_at: { gt: startsAt } } });
      const inClass = await coachBusyByClass(this.db, c.id, startsAt, endsAt);
      if (taken || inClass) {
        throw new ConflictException({ code: 'coach_busy', message: `${c.name} в это время занят — выберите другого тренера` });
      }
      coach = c;
      coachPrice = c.price * dto.hours;
      // У кого корт входит в цену тренировки — за корт отдельно не берём
      if (!c.court_extra) price = 0;
    }

    // Срок удержания считаем от «сейчас», но не дальше начала самой игры:
    // держать место после того, как игра началась, бессмысленно.
    const holdUntil = new Date(Math.min(
      Date.now() + set.holdMinutes * 60_000, +startsAt));

    // Второй номер запоминаем, но не затираем прежний пустым значением
    const wa = dto.whatsapp ? normalizePhone(dto.whatsapp) : null;
    const surname = dto.surname?.trim() || null;
    // Чужую анкету заявка не переписывает: если на номере стоит пароль, имя
    // и номера меняет только сам хозяин, войдя в аккаунт. Записаться при этом
    // можно — бронь на чужой номер вреда не делает, менеджер всё равно звонит.
    const pending = await this.db.bookings.count({ where: {
      client_id: me.id, status: 'pending', starts_at: { gt: new Date() },
      OR: [{ hold_until: null }, { hold_until: { gt: new Date() } }],
    } });
    if (pending >= MAX_PENDING_PER_PHONE) {
      throw new HttpException(
        `У вас уже ${pending} заявки ждут подтверждения. Дождитесь ответа клуба или напишите менеджеру`, 429);
    }
    // Второй номер запоминаем, имя аккаунта заявка не меняет — оно в «Моих данных»
    const client = wa && wa !== me.whatsapp
      ? await this.db.clients.update({ where: { id: me.id }, data: { whatsapp: wa } })
      : me;

    try {
      const b = await this.db.bookings.create({
        data: {
          court_id: court.id, client_id: client.id,
          starts_at: startsAt, ends_at: endsAt,
          price, comment: dto.comment, source: 'app',
          coach_id: coach?.id ?? null, coach_price: coachPrice,
          // Держим время ограниченный срок: оплата идёт через менеджера,
          // и до подтверждения место не должно висеть занятым бесконечно.
          hold_until: holdUntil,
        },
      });
      return {
        id: Number(b.id), courtId: court.id, courtName: court.name,
        startsAt: b.starts_at, endsAt: b.ends_at, price: price + coachPrice, status: b.status,
        coachName: coach ? coach.name : null, coachPrice,
        holdUntil: b.hold_until, holdMinutes: set.holdMinutes,
        // Номер аккаунта: приложение пишет его в сообщение WhatsApp, чтобы
        // менеджер отличал заявки разных людей, пришедшие одновременно
        clientId: Number(client.id),
      };
    } catch (e: any) {
      // Тренера заняли в эти же секунды: корт свободен, менять надо тренера
      if (String(e?.message).includes('no_double_coach')) {
        throw new ConflictException({ code: 'coach_busy',
          message: `${coach?.name ?? 'Тренер'} в это время только что занят` });
      }
      // База не дала создать пересекающуюся бронь — значит время увели,
      // пока человек заполнял заявку. Отвечаем честно и с заменой.
      if (e?.meta?.code === EXCLUSION_VIOLATION || String(e?.message).includes(EXCLUSION_VIOLATION)) {
        throw new ConflictException({
          code: 'slot_taken',
          message: 'Это время только что заняли',
          alternatives: await this.alternatives(dto.date, dto.hour, dto.hours, court.id, dh.close),
        });
      }
      throw e;
    }
  }

  /** Отмена. Строку не удаляем: менеджеру нужна история отмен по клиенту. */
  @Delete(':id')
  async cancel(@Param('id') id: string, @Query('phone') phone?: string,
               @Headers('authorization') header?: string) {
    const client = await this.whose(header, phone);
    const booking = await this.db.bookings.findUnique({ where: { id: bigId(id) } });
    if (!booking || !client || booking.client_id !== client.id) {
      throw new NotFoundException('Запись не найдена');
    }
    if (!['pending', 'confirmed'].includes(booking.status)) {
      throw new ConflictException('Эту запись уже нельзя отменить');
    }
    if (booking.starts_at < new Date()) {
      throw new ConflictException('Игра уже началась — отменить нельзя, напишите менеджеру');
    }
    // Правило клуба (заказчик, 17.09.2026): отмена не позже чем за cancelHours;
    // позже отменить можно, но предоплата сгорает — это помечается в записи
    const set = await this.club.get();
    const late = +booking.starts_at - Date.now() < set.cancelHours * 3600_000;
    // Внесённое при поздней отмене остаётся клубу — то же правило, что и
    // при отмене через менеджера (D13, D27)
    const paid = (await this.db.payments.aggregate({
      where: { booking_id: booking.id }, _sum: { amount: true } }))._sum.amount ?? 0;
    // Ракетки и мячи из счёта человек не брал — строки убираем, товар возвращаем
    const lines = await this.db.sales.findMany({
      where: { booking_id: booking.id, method: 'bill', product_id: { not: null } }, include: { products: true } });
    const back = new Map<string, number>();
    const ops: any[] = [
      this.db.bookings.update({ where: { id: booking.id }, data: {
        status: 'cancelled', status_at: new Date(),
        status_by: late ? 'client, поздняя отмена' : 'client',
        kept_prepay: late && paid > 0,
      }}),
    ];
    // Счётчик отмен — только за подтверждённую бронь: отказ от своей же
    // неподтверждённой заявки человеку не в укор
    if (booking.status === 'confirmed') {
      ops.push(this.db.clients.update({ where: { id: client.id }, data: { cancels: { increment: 1 } } }));
    }
    for (const l of lines) {
      const pr = l.products;
      if (!pr || pr.category === 'rental' || pr.stock == null) continue;
      const after = (back.get(String(pr.id)) ?? pr.stock) + l.qty;
      back.set(String(pr.id), after);
      ops.push(this.db.products.update({ where: { id: pr.id }, data: { stock: { increment: l.qty } } }));
      ops.push(this.db.stock_moves.create({ data: {
        product_id: pr.id, kind: 'return', qty: l.qty, stock_after: after,
        note: `бронь №${Number(booking.id)} отменена в приложении`, admin_name: 'приложение',
      }}));
    }
    ops.push(this.db.sales.deleteMany({ where: { booking_id: booking.id, method: 'bill' } }));
    await this.db.$transaction(ops);
    return { id: Number(booking.id), status: 'cancelled', late, kept: late && paid > 0, cancelHours: set.cancelHours };
  }

  /** Чем заменить занятое время: сначала другие площадки того же типа
   *  в тот же час, потом ближайшее время на той же площадке. */
  private async alternatives(date: string, hour: number, hours: number,
                             exceptId: string, closeHour: number) {
    const courts = await this.db.courts.findMany({ where: { is_active: true }, orderBy: { sort_order: 'asc' } });
    const from = courts.find(c => c.id === exceptId);
    const busy = await this.db.bookings.findMany({
      where: {
        status: { notIn: ['cancelled', 'expired'] },
        starts_at: { gte: clubHour(date, 0), lt: clubHour(date, 24) },
      },
      select: { court_id: true, starts_at: true, ends_at: true },
    });

    const taken = (courtId: string, h: number, n: number) =>
      busy.some(b => b.court_id === courtId &&
        clubHour(date, h) < b.ends_at && clubHour(date, h + n) > b.starts_at);

    const sameTime = courts
      .filter(c => c.id !== exceptId && c.is_football === from?.is_football && !taken(c.id, hour, hours))
      .slice(0, 3)
      .map(c => ({ courtId: c.id, courtName: c.name, hour, hours }));

    let later: { courtId: string; courtName: string; hour: number; hours: number } | null = null;
    for (let h = hour + 1; h + hours <= closeHour; h++) {
      if (!taken(exceptId, h, hours)) {
        later = { courtId: exceptId, courtName: from?.name ?? exceptId, hour: h, hours };
        break;
      }
    }
    return { sameTime, later };
  }
}
