/** Тренеры в админке: профили, расписание, тренировки, начисления, выплаты. */
import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get,
  NotFoundException, Param, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminGuard, CoachOk, Needs } from '../admin/admin.guard';
import { AuthService, makePassword, sealPassword, type Admin } from '../admin/auth.service';
import { clubHour, clubToday, hourOf, isValidDate, shiftDate } from '../time';
import { bigId, normalizePhone } from '../phone';
import { cleanWeek, coachPart, lessonPay, classPay } from './coach.util';
import { saveImage, dropUpload, PAY_METHODS, checkPassword } from '../admin/admin.controller';

const PLAYED = ['confirmed', 'done'];
const COLOR = /^#[0-9a-f]{6}$/i;

@UseGuards(AdminGuard)
@Controller('admin')
export class AdminCoachesController {
  constructor(private readonly db: PrismaService, private readonly auth: AuthService) {}

  private dateOf(d: Date) { return new Date(+d + 3 * 3600_000).toISOString().slice(0, 10) }

  /** Коротко о тренерах — для записи клиента и сетки. Без денег тренера. */
  @Get('coaches/brief')
  async brief() {
    const rows = await this.db.coaches.findMany({ orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] });
    return rows.map(c => ({ id: Number(c.id), name: c.name, color: c.color, price: c.price,
      courtExtra: c.court_extra, isActive: c.is_active, photoUrl: c.photo_url, week: c.week }));
  }

  /** Сводка по тренерам за период: сколько провёл, сколько принёс,
   *  сколько ему начислено, выплачено и сколько клуб ещё должен. */
  @Get('coaches')
  @Needs('coaches')
  async list(@Query('from') fromQ?: string, @Query('to') toQ?: string) {
    const to = toQ && isValidDate(toQ) ? toQ : clubToday();
    const from = fromQ && isValidDate(fromQ) ? fromQ : shiftDate(to, -29);
    const rows = await this.db.coaches.findMany({ orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] });
    const out = [];
    for (const c of rows) {
      const period = await this.report(c, from, to);
      const all = await this.report(c, '2000-01-01', clubToday());
      const paidAll = (await this.db.coach_payouts.aggregate({ where: { coach_id: c.id }, _sum: { amount: true } }))._sum.amount ?? 0;
      out.push({ ...this.card(c), period: period.totals, balance: all.totals.pay - paidAll });
    }
    return { from, to, coaches: out };
  }

  private card(c: any) {
    return { id: Number(c.id), name: c.name, surname: c.surname, experience: c.experience,
      phone: c.phone, photoUrl: c.photo_url, bio: c.bio,
      price: c.price, courtExtra: c.court_extra, payType: c.pay_type, payValue: c.pay_value,
      week: c.week, color: c.color, inApp: c.in_app, isActive: c.is_active,
      adminId: c.admin_id ? Number(c.admin_id) : null };
  }

  /** Все тренировки тренера за период с деньгами и начислением. */
  private async report(c: any, from: string, to: string) {
    const a = clubHour(from, 0), b = clubHour(shiftDate(to, 1), 0);
    const now = new Date();
    const [bk, cls, pays] = await Promise.all([
      this.db.bookings.findMany({ where: { coach_id: c.id, starts_at: { gte: a, lt: b } },
        orderBy: { starts_at: 'desc' }, include: { clients: true, courts: true } }),
      this.db.tournaments.findMany({ where: { coach_id: c.id, kind: 'class', starts_at: { gte: a, lt: b } },
        orderBy: { starts_at: 'desc' }, include: { tournament_entries: true } }),
      this.db.coach_payouts.findMany({ where: { coach_id: c.id, created_at: { gte: a, lt: b } }, orderBy: { id: 'desc' } }),
    ]);
    const lessons = bk.map(x => {
      const hours = Math.round((+x.ends_at - +x.starts_at) / 3600_000);
      const done = PLAYED.includes(x.status) && x.ends_at <= now;
      const revenue = coachPart(x);
      return { id: Number(x.id), date: this.dateOf(x.starts_at), hour: hourOf(x.starts_at), hours,
        court: x.courts?.name ?? x.court_id, status: x.status, done,
        client: [x.clients?.name, x.clients?.surname].filter(Boolean).join(' ') || x.guest_name || 'Без имени',
        clientId: x.client_id ? Number(x.client_id) : null,
        revenue, pay: done ? lessonPay(c, { hours, revenue }) : 0 };
    });
    const classes = cls.map(t => {
      const live = t.tournament_entries.filter(e => ['pending', 'confirmed'].includes(e.status));
      const fees = t.tournament_entries.reduce((n, e) => n + (e.paid_amount ?? 0), 0);
      const done = t.state !== 'cancelled' && +t.starts_at + t.hours * 3600_000 <= +now;
      return { id: Number(t.id), name: t.name, date: this.dateOf(t.starts_at), hour: hourOf(t.starts_at),
        hours: t.hours, state: t.state, done, seats: t.seats,
        participants: live.filter(e => e.status === 'confirmed').length,
        attended: t.tournament_entries.filter(e => e.attended === true).length,
        revenue: fees, pay: done ? classPay(c, { hours: t.hours, revenue: fees }) : 0 };
    });
    const doneL = lessons.filter(l => l.done), doneC = classes.filter(x => x.done);
    const totals = {
      lessons: doneL.length, lessonHours: doneL.reduce((n, l) => n + l.hours, 0),
      clients: new Set(doneL.map(l => l.clientId ?? l.client)).size,
      classes: doneC.length, classPeople: doneC.reduce((n, x) => n + x.participants, 0),
      // Впереди — все будущие, независимо от выбранного периода
      upcoming: await this.db.bookings.count({ where: { coach_id: c.id, status: { in: ['pending', 'confirmed'] }, ends_at: { gt: now } } })
        + await this.db.tournaments.count({ where: { coach_id: c.id, kind: 'class', state: { not: 'cancelled' }, starts_at: { gt: now } } }),
      noShows: lessons.filter(l => l.status === 'no_show').length,
      revenue: doneL.reduce((n, l) => n + l.revenue, 0) + doneC.reduce((n, x) => n + x.revenue, 0),
      pay: doneL.reduce((n, l) => n + l.pay, 0) + doneC.reduce((n, x) => n + x.pay, 0),
      paid: pays.reduce((n, p) => n + p.amount, 0),
    };
    return { lessons, classes, totals,
      payouts: pays.map(p => ({ id: Number(p.id), amount: p.amount, method: p.method, note: p.note,
        from: p.period_from ? p.period_from.toISOString().slice(0, 10) : null,
        to: p.period_to ? p.period_to.toISOString().slice(0, 10) : null, by: p.admin_name, at: p.created_at })) };
  }

  /** Отчёт по одному тренеру. Сам тренер (вход, привязанный к нему) видит свой. */
  @Get('coaches/:id/report')
  @CoachOk()
  async coachReport(@Req() req: any, @Param('id') id: string, @Query('from') fromQ?: string, @Query('to') toQ?: string) {
    const c = await this.db.coaches.findUnique({ where: { id: bigId(id) } });
    if (!c) throw new NotFoundException('Тренер не найден');
    const me: Admin = req.admin;
    if (!this.auth.can(me, 'coaches') && Number(c.admin_id) !== me.id) throw new ForbiddenException('Нет доступа');
    const to = toQ && isValidDate(toQ) ? toQ : clubToday();
    const from = fromQ && isValidDate(fromQ) ? fromQ : shiftDate(to, -29);
    const r = await this.report(c, from, to);
    const all = await this.report(c, '2000-01-01', clubToday());
    const paidAll = (await this.db.coach_payouts.aggregate({ where: { coach_id: c.id }, _sum: { amount: true } }))._sum.amount ?? 0;
    return { from, to, coach: this.card(c), ...r, balance: all.totals.pay - paidAll };
  }

  /** Тренер, к которому привязан этот вход, — для раздела «Мои тренировки». */
  @Get('me/coach')
  @CoachOk()
  async myCoach(@Req() req: any) {
    const c = await this.db.coaches.findFirst({ where: { admin_id: BigInt(req.admin.id) } });
    return c ? { id: Number(c.id), name: c.name } : null;
  }

  /** Завести или изменить тренера. */
  @Post('coaches')
  @Needs('coaches')
  async save(@Req() req: any, @Body() body: any) {
    const data: any = { updated_at: new Date() };
    if (body.name != null) {
      const n = String(body.name).trim().slice(0, 80);
      if (n.length < 2) throw new BadRequestException('Имя от 2 знаков');
      data.name = n;
    }
    if (body.surname !== undefined) data.surname = String(body.surname ?? '').trim().slice(0, 80) || null;
    if (body.experience !== undefined) data.experience = String(body.experience ?? '').trim().slice(0, 120) || null;
    if (body.phone !== undefined) {
      const p = String(body.phone ?? '').trim();
      data.phone = p ? (normalizePhone(p) ?? (() => { throw new BadRequestException('Не разобрал телефон') })()) : null;
    }
    if (body.bio !== undefined) data.bio = String(body.bio ?? '').trim().slice(0, 1000) || null;
    if (body.price != null) data.price = rub(body.price);
    if (body.courtExtra != null) data.court_extra = !!body.courtExtra;
    if (body.payType != null) {
      if (!['percent', 'per_hour', 'per_lesson'].includes(body.payType)) throw new BadRequestException('Неизвестная схема оплаты');
      data.pay_type = body.payType;
    }
    if (body.payValue != null) {
      const t = data.pay_type ?? body.payType;
      data.pay_value = t === 'percent' ? Math.min(100, Math.max(0, Math.trunc(Number(body.payValue) || 0))) : rub(body.payValue);
    }
    if (body.week !== undefined) data.week = body.week === null ? null : cleanWeek(body.week);
    if (body.color !== undefined) data.color = COLOR.test(String(body.color ?? '')) ? body.color : null;
    if (body.inApp != null) data.in_app = !!body.inApp;
    if (body.isActive != null) data.is_active = !!body.isActive;
    if (body.adminId !== undefined) {
      if (body.adminId == null || body.adminId === '') data.admin_id = null;
      else {
        const a = await this.db.admins.findUnique({ where: { id: bigId(String(body.adminId)) } });
        if (!a) throw new NotFoundException('Сотрудник не найден');
        data.admin_id = a.id;
      }
    }
    if (body.id) {
      const c = await this.db.coaches.update({ where: { id: bigId(String(body.id)) }, data });
      await this.auth.log(req.admin, 'изменил тренера', c.name);
      return { id: Number(c.id) };
    }
    if (!data.name) throw new BadRequestException('Впишите имя тренера');
    const last = await this.db.coaches.findFirst({ orderBy: { sort_order: 'desc' } });
    const c = await this.db.coaches.create({ data: { ...data, sort_order: (last?.sort_order ?? 0) + 1 } });
    await this.auth.log(req.admin, 'завёл тренера', c.name);
    return { id: Number(c.id) };
  }

  /** Отдельный вход для тренера.
   *
   *  Тренеру нужен свой логин, но не нужна вся админка: он видит только
   *  свой кабинет — записи к нему, историю тренировок и свой заработок.
   *  Поэтому заводим учётную запись с ролью «тренер»: прав по клубу у неё
   *  нет совсем, а сервер не отдаёт ей ничего, кроме её же отчёта. */
  @Post('coaches/:id/login')
  @Needs('coaches')
  async coachLogin(@Req() req: any, @Param('id') id: string, @Body() body: { login?: string; password?: string }) {
    const c = await this.db.coaches.findUnique({ where: { id: bigId(id) } });
    if (!c) throw new NotFoundException('Тренер не найден');

    // Уже есть вход — просто меняем пароль
    if (c.admin_id) {
      const row = await this.db.admins.findUnique({ where: { id: c.admin_id } });
      if (row && row.role === 'coach') {
        const password = checkPassword(body.password ? String(body.password) : makePassword());
        await this.db.admins.update({ where: { id: row.id }, data: {
          password_hash: await this.auth.hash(password), password_enc: sealPassword(password), is_active: true } });
        await this.auth.dropSessions(Number(row.id));
        await this.auth.log(req.admin, 'сменил пароль тренеру', `${c.name} (${row.login})`);
        return { login: row.login, password, existed: true };
      }
    }

    const login = String(body.login ?? '').trim().toLowerCase()
      || 'coach' + String(Number(c.id)).padStart(2, '0');
    if (!/^[a-z0-9._-]{3,32}$/.test(login)) {
      throw new BadRequestException('Логин: 3–32 знака, латиница, цифры, точка, дефис');
    }
    if (await this.db.admins.findUnique({ where: { login } })) {
      throw new BadRequestException('Такой логин уже занят');
    }
    const password = checkPassword(body.password ? String(body.password) : makePassword());
    const created = await this.db.admins.create({ data: {
      login, name: [c.name, c.surname].filter(Boolean).join(' '), role: 'coach', perms: [],
      password_hash: await this.auth.hash(password), password_enc: sealPassword(password),
    }});
    await this.db.coaches.update({ where: { id: c.id }, data: { admin_id: created.id } });
    await this.auth.log(req.admin, 'завёл вход тренеру', `${c.name} (${login})`);
    return { login, password, existed: false };
  }

  @Post('coaches/:id/photo')
  @Needs('coaches')
  async photo(@Param('id') id: string, @Body() body: { data?: string }) {
    const c = await this.db.coaches.findUnique({ where: { id: bigId(id) } });
    if (!c) throw new NotFoundException('Тренер не найден');
    const url = await saveImage(body.data, 'coaches', 1200);
    await this.db.coaches.update({ where: { id: c.id }, data: { photo_url: url, updated_at: new Date() } });
    await dropUpload(c.photo_url);
    return { url };
  }

  /** Убрать тренера. Если у него были тренировки — только выключаем: история остаётся. */
  @Post('coaches/:id/delete')
  @Needs('coaches')
  async remove(@Req() req: any, @Param('id') id: string) {
    const c = await this.db.coaches.findUnique({ where: { id: bigId(id) } });
    if (!c) throw new NotFoundException('Тренер не найден');
    const used = await this.db.bookings.count({ where: { coach_id: c.id } })
      + await this.db.tournaments.count({ where: { coach_id: c.id } });
    if (used) {
      await this.db.coaches.update({ where: { id: c.id }, data: { is_active: false, in_app: false } });
      await this.auth.log(req.admin, 'выключил тренера', c.name);
      return { ok: true, hidden: true };
    }
    await this.db.coaches.delete({ where: { id: c.id } });
    await dropUpload(c.photo_url);
    await this.auth.log(req.admin, 'удалил тренера', c.name);
    return { ok: true };
  }

  /** Выплата тренеру. */
  @Post('coaches/:id/payouts')
  @Needs('coaches')
  async payout(@Req() req: any, @Param('id') id: string, @Body() body: {
    amount?: number; method?: string; note?: string; from?: string; to?: string;
  }) {
    const c = await this.db.coaches.findUnique({ where: { id: bigId(id) } });
    if (!c) throw new NotFoundException('Тренер не найден');
    const amount = rub(body.amount);
    if (amount <= 0) throw new BadRequestException('Сумма должна быть больше нуля');
    const method = String(body.method ?? 'cash');
    if (!PAY_METHODS.includes(method)) throw new BadRequestException('Такого способа оплаты нет');
    const p = await this.db.coach_payouts.create({ data: {
      coach_id: c.id, amount, method, note: body.note ? String(body.note).trim().slice(0, 200) : null,
      period_from: body.from && isValidDate(body.from) ? new Date(body.from) : null,
      period_to: body.to && isValidDate(body.to) ? new Date(body.to) : null,
      admin_id: BigInt(req.admin.id), admin_name: req.admin.name,
    }});
    await this.auth.log(req.admin, 'выплатил тренеру', `${c.name}, ${(amount / 100).toLocaleString('ru-RU')} ₽`);
    return { id: Number(p.id) };
  }

  @Post('payouts/:id/delete')
  @Needs('coaches')
  async dropPayout(@Req() req: any, @Param('id') id: string) {
    const p = await this.db.coach_payouts.findUnique({ where: { id: bigId(id) }, include: { coaches: true } });
    if (!p) throw new NotFoundException('Выплата не найдена');
    await this.db.coach_payouts.delete({ where: { id: p.id } });
    await this.auth.log(req.admin, 'убрал выплату тренеру', `${p.coaches.name}, ${(p.amount / 100).toLocaleString('ru-RU')} ₽`);
    return { ok: true };
  }

  /** Отметить участника групповой тренировки: пришёл или нет. */
  @Post('entries/:id/attended')
  async attended(@Req() req: any, @Param('id') id: string, @Body() body: { attended?: boolean | null }) {
    const e = await this.db.tournament_entries.findUnique({ where: { id: bigId(id) }, include: { tournaments: true } });
    if (!e) throw new NotFoundException('Запись не найдена');
    const me: Admin = req.admin;
    const own = e.tournaments.coach_id ? await this.db.coaches.findUnique({ where: { id: e.tournaments.coach_id } }) : null;
    if (!this.auth.can(me, 'tournaments') && Number(own?.admin_id) !== me.id) throw new ForbiddenException('Нет доступа');
    if (e.status !== 'confirmed') throw new ConflictException('Отмечают только подтверждённых участников');
    await this.db.tournament_entries.update({ where: { id: e.id },
      data: { attended: body.attended == null ? null : !!body.attended } });
    return { ok: true };
  }
}

/** Рубли из формы в копейки. */
function rub(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) throw new BadRequestException('Сумма от 0 до 1 000 000 ₽');
  return n * 100;
}
