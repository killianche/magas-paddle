/** Тренеры в приложении: список, свободные часы, запись на тренировку.
 *
 *  Индивидуальная тренировка — это бронь корта с тренером. Корт подбираем
 *  сами (первый свободный падел-корт по порядку), человек выбирает тренера,
 *  день и время. Заявка ждёт подтверждения клуба, как обычная бронь.
 *  Двойную запись тренера или корта не пропустит сама база. */
import {
  BadRequestException, Body, ConflictException, Controller, Get, Headers, HttpException,
  NotFoundException, Param, Post, Query, Req, UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClubService } from '../club';
import { ClientAuthService } from '../clients/client-auth.service';
import { clubHour, clubToday, isValidDate, shiftDate, weekdayOf } from '../time';
import { bigId } from '../phone';
import { ipOf, limitRate } from '../ratelimit';
import { MAX_PENDING_PER_PHONE, REQUESTS_PER_HOUR } from '../bookings/bookings.controller';
import { coachHours, coachBusyByClass } from './coach.util';

const DAYS_AHEAD = 30;
const LIVE = { notIn: ['cancelled', 'expired'] as any };

@Controller('coaches')
export class CoachesController {
  constructor(
    private readonly db: PrismaService,
    private readonly club: ClubService,
    private readonly auth: ClientAuthService,
  ) {}

  /** Тренеры для приложения: без схемы оплаты и служебных полей. */
  @Get()
  async list() {
    const rows = await this.db.coaches.findMany({
      where: { is_active: true, in_app: true }, orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] });
    const now = new Date();
    const classes = await this.db.tournaments.groupBy({
      by: ['coach_id'], where: { kind: 'class', state: 'open', starts_at: { gt: now } }, _count: { _all: true } });
    const cl = new Map(classes.map(c => [String(c.coach_id), c._count._all]));
    return rows.map(c => ({
      id: Number(c.id), name: c.name, photoUrl: c.photo_url, bio: c.bio,
      price: c.price, courtExtra: c.court_extra, color: c.color,
      classes: cl.get(String(c.id)) ?? 0,
    }));
  }

  /** Свободные часы тренера в день: тренер работает и свободен, и есть
   *  свободный падел-корт на всё время тренировки. */
  @Get(':id/slots')
  async slots(@Param('id') id: string, @Query('date') date?: string, @Query('hours') hoursQ?: string) {
    if (!date || !isValidDate(date)) throw new BadRequestException('Неверная дата');
    const hours = Math.min(3, Math.max(1, Math.trunc(Number(hoursQ ?? 1)) || 1));
    const coach = await this.db.coaches.findUnique({ where: { id: bigId(id) } });
    if (!coach || !coach.is_active || !coach.in_app) throw new NotFoundException('Тренер не найден');
    return { date, hours, slots: await this.freeSlots(coach, date, hours) };
  }

  private async freeSlots(coach: any, date: string, hours: number) {
    await this.club.releaseExpired();
    const pricing = await this.club.pricing();
    const wh = coachHours(coach, pricing.settings, date);
    if (!wh) return [];
    const dayFrom = clubHour(date, 0), dayTo = clubHour(shiftDate(date, 1), 0);
    const [courts, busy, classes] = await Promise.all([
      this.db.courts.findMany({ where: { is_active: true, is_football: false }, orderBy: { sort_order: 'asc' } }),
      this.db.bookings.findMany({ where: { status: LIVE, starts_at: { lt: dayTo }, ends_at: { gt: dayFrom } },
        select: { court_id: true, coach_id: true, starts_at: true, ends_at: true } }),
      // Групповые тренировки этого тренера: в это время он занят с группой
      this.db.tournaments.findMany({ where: { kind: 'class', coach_id: coach.id, state: { notIn: ['cancelled'] },
        starts_at: { gte: new Date(+dayFrom - 6 * 3600_000), lt: dayTo } },
        select: { starts_at: true, hours: true } }),
    ]);
    const now = Date.now();
    const out: { hour: number; courtId: string; price: number; coachPrice: number; courtPrice: number }[] = [];
    for (let h = wh.open; h + hours <= wh.close; h++) {
      const a = clubHour(date, h), b = clubHour(date, h + hours);
      if (+a <= now) continue;
      const overlaps = (x: { starts_at: Date; ends_at: Date }) => x.starts_at < b && x.ends_at > a;
      if (busy.some(x => x.coach_id === coach.id && overlaps(x))) continue;
      if (classes.some(t => +t.starts_at < +b && +t.starts_at + t.hours * 3600_000 > +a)) continue;
      const court = courts.find(c => !(c.closed_until && c.closed_until > a)
        && !busy.some(x => x.court_id === c.id && overlaps(x)));
      if (!court) continue;
      const courtPrice = coach.court_extra ? pricing.span(court, weekdayOf(date), h, hours) : 0;
      const coachPrice = coach.price * hours;
      out.push({ hour: h, courtId: court.id, courtPrice, coachPrice, price: courtPrice + coachPrice });
    }
    return out;
  }

  /** Запись на индивидуальную тренировку из приложения. */
  @Post(':id/book')
  async book(@Req() req: any, @Param('id') id: string, @Body() body: {
    date?: string; hour?: number; hours?: number; comment?: string;
  }, @Headers('authorization') header?: string) {
    const me = await this.auth.whoIs(this.auth.tokenOf(header));
    if (!me) throw new UnauthorizedException('Войдите в аккаунт, чтобы записаться');
    const date = String(body.date ?? '');
    if (!isValidDate(date)) throw new BadRequestException('Неверная дата');
    if (date > shiftDate(clubToday(), DAYS_AHEAD)) {
      throw new BadRequestException(`Записаться можно не дальше чем на ${DAYS_AHEAD} дней вперёд`);
    }
    const hours = Math.min(3, Math.max(1, Math.trunc(Number(body.hours ?? 1)) || 1));
    const hour = Math.trunc(Number(body.hour));
    const coach = await this.db.coaches.findUnique({ where: { id: bigId(id) } });
    if (!coach || !coach.is_active || !coach.in_app) throw new NotFoundException('Тренер не найден');

    const slot = (await this.freeSlots(coach, date, hours)).find(s => s.hour === hour);
    if (!slot) throw new ConflictException({ code: 'slot_taken', message: 'Это время уже занято — выберите другое' });

    const pending = await this.db.bookings.count({ where: {
      client_id: me.id, status: 'pending', starts_at: { gt: new Date() },
      OR: [{ hold_until: null }, { hold_until: { gt: new Date() } }] } });
    if (pending >= MAX_PENDING_PER_PHONE) {
      throw new HttpException(`У вас уже ${pending} заявки ждут подтверждения. Дождитесь ответа клуба`, 429);
    }
    limitRate(`book:${ipOf(req)}`, REQUESTS_PER_HOUR, 3600_000,
      'Слишком много заявок подряд. Попробуйте через час или позвоните в клуб');

    const set = (await this.club.pricing()).settings;
    const startsAt = clubHour(date, hour), endsAt = clubHour(date, hour + hours);
    try {
      const b = await this.db.bookings.create({ data: {
        court_id: slot.courtId, client_id: me.id, starts_at: startsAt, ends_at: endsAt,
        price: slot.courtPrice, coach_id: coach.id, coach_price: slot.coachPrice,
        comment: body.comment ? String(body.comment).trim().slice(0, 300) : null, source: 'app',
        hold_until: new Date(Math.min(Date.now() + set.holdMinutes * 60_000, +startsAt)),
      }});
      const court = await this.db.courts.findUnique({ where: { id: slot.courtId } });
      return { id: Number(b.id), courtName: court?.name ?? slot.courtId, coachName: coach.name,
        startsAt, endsAt, price: slot.price, status: b.status, holdMinutes: set.holdMinutes, clientId: Number(me.id) };
    } catch (e: any) {
      if (String(e?.message ?? '').includes('23P01')) {
        throw new ConflictException({ code: 'slot_taken', message: 'Это время только что заняли — выберите другое' });
      }
      throw e;
    }
  }
}
