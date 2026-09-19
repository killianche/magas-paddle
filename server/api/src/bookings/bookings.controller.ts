import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get,
  Headers, HttpException, NotFoundException, Param, Post, Query, Req, UnauthorizedException,
} from '@nestjs/common';
import { ipOf, limitRate } from '../ratelimit';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto';
import { ClubService, hoursOn } from '../club';
import { normalizePhone } from '../phone';
import { ClientAuthService } from '../clients/client-auth.service';
import { clubHour, clubToday, hourOf, isValidDate, shiftDate, weekdayOf } from '../time';

/** Защита от ботов (решение заказчика 17.09.2026): не больше 3 неподтверждённых
 *  заявок на номер, запись не дальше 30 дней вперёд, не больше 10 заявок в час
 *  с одного адреса. */
export const MAX_PENDING_PER_PHONE = 3;
export const DAYS_AHEAD = 30;
export const REQUESTS_PER_HOUR = 10;

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
    });
    const courts = new Map((await this.db.courts.findMany()).map(c => [c.id, c.name]));
    // Строки счёта (прокат, мячи) и внесённые деньги — человек видит, сколько
    // должен и за что, теми же цифрами, что и менеджер
    const ids = rows.map(r => r.id);
    const [extras, paid] = ids.length ? await Promise.all([
      this.db.sales.findMany({ where: { booking_id: { in: ids } }, orderBy: { id: 'asc' } }),
      this.db.payments.groupBy({ by: ['booking_id'], where: { booking_id: { in: ids } }, _sum: { amount: true } }),
    ]) : [[], []];
    const paidBy = new Map(paid.map(p => [String(p.booking_id), p._sum.amount ?? 0]));

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
      discount: b.discount,
      paid: paidBy.get(String(b.id)) ?? 0,
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
    limitRate(`req:${ipOf(req)}`, REQUESTS_PER_HOUR, 3600_000,
      'Слишком много заявок подряд. Попробуйте через час или позвоните в клуб');
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

    // Цена складывается по часам: часы могут попадать под разные тарифы
    const price = pricing.span(court, weekdayOf(dto.date), dto.hour, dto.hours);

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
          // Держим время ограниченный срок: оплата идёт через менеджера,
          // и до подтверждения место не должно висеть занятым бесконечно.
          hold_until: holdUntil,
        },
      });
      return {
        id: Number(b.id), courtId: court.id, courtName: court.name,
        startsAt: b.starts_at, endsAt: b.ends_at, price, status: b.status,
        holdUntil: b.hold_until, holdMinutes: set.holdMinutes,
        // Номер аккаунта: приложение пишет его в сообщение WhatsApp, чтобы
        // менеджер отличал заявки разных людей, пришедшие одновременно
        clientId: Number(client.id),
      };
    } catch (e: any) {
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
    const booking = await this.db.bookings.findUnique({ where: { id: BigInt(id) } });
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
    await this.db.$transaction([
      this.db.bookings.update({ where: { id: booking.id }, data: {
        status: 'cancelled', status_at: new Date(),
        status_by: late ? 'client, поздняя отмена' : 'client',
      }}),
      this.db.clients.update({ where: { id: client.id }, data: { cancels: { increment: 1 } } }),
    ]);
    return { id: Number(booking.id), status: 'cancelled', late, cancelHours: set.cancelHours };
  }

  /** Чем заменить занятое время: сначала другие площадки того же типа
   *  в тот же час, потом ближайшее время на той же площадке. */
  private async alternatives(date: string, hour: number, hours: number,
                             exceptId: string, closeHour: number) {
    const courts = await this.db.courts.findMany({ where: { is_active: true }, orderBy: { sort_order: 'asc' } });
    const from = courts.find(c => c.id === exceptId);
    const busy = await this.db.bookings.findMany({
      where: {
        status: { not: 'cancelled' },
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
