import {
  BadRequestException, Body, Controller, ForbiddenException, Get, HttpException,
  NotFoundException, Param, Post, Query, Req, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AdminGuard, Needs } from './admin.guard';
import { AuthService, PERMS, type Admin, type Perm } from './auth.service';
import { clubHour, clubToday, hourOf, isValidDate, weekdayOf, shiftDate } from '../time';
import { ClubService } from '../club';
import { normalizePhone } from '../phone';

class StatusDto {
  @IsIn(['confirmed', 'cancelled', 'no_show', 'done'])
  status: 'confirmed' | 'cancelled' | 'no_show' | 'done';
}

class CloseCourtDto {
  @IsOptional() @IsString() @MaxLength(120) reason?: string;
  /** ISO-дата, до которой площадка закрыта. Пусто — открыть снова. */
  @IsOptional() @IsString() until?: string;
}

/** Вход. Единственный метод админки без охраны — иначе войти было бы нечем. */
@Controller('admin')
export class AdminAuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  async login(@Req() req: any, @Body() body: { login?: string; password?: string }) {
    const login = String(body.login ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    if (!login || !password) throw new BadRequestException('Введите логин и пароль');

    // Считаем попытки и по логину, и по адресу: иначе перебор одного логина
    // с разных адресов или всех логинов с одного останется возможным.
    const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim()
      || req.socket?.remoteAddress || 'неизвестно';
    const keys = [`login:${login}`, `ip:${ip}`];

    const left = this.auth.lockedFor(keys);
    if (left > 0) {
      throw new HttpException(
        `Слишком много попыток. Попробуйте через ${Math.ceil(left / 60)} мин`, 429);
    }

    const res = await this.auth.login(login, password);
    if (!res) {
      this.auth.noteFail(keys);
      // Небольшая задержка: перебор становится дороже, живому человеку незаметно
      await new Promise(r => setTimeout(r, 400));
      // Одна и та же фраза на неверный логин и неверный пароль:
      // иначе по ответу можно перебрать, какие логины существуют.
      throw new UnauthorizedException('Неверный логин или пароль');
    }

    this.auth.clearFails(keys);
    await this.auth.log(res.admin, 'вошёл в админку');
    return { token: res.token, admin: res.admin, perms: PERMS };
  }
}

@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly db: PrismaService,
    private readonly club: ClubService,
    private readonly auth: AuthService,
  ) {}

  /** Кто я и что мне можно — панель по этому прячет недоступное. */
  @Get('me')
  me(@Req() req: any) {
    const admin: Admin = req.admin;
    return { admin, perms: PERMS, can: Object.keys(PERMS).filter(
      p => this.auth.can(admin, p as Perm)) };
  }

  @Post('logout')
  async logout(@Req() req: any) {
    const header = String(req.headers['authorization'] ?? '');
    const token = header.startsWith('Bearer ') ? header.slice(7) : req.headers['x-admin-token'];
    await this.auth.log(req.admin, 'вышел из админки');
    await this.auth.logout(token);
    return { ok: true };
  }

  /* ── сотрудники ─────────────────────────────────────────────────────── */

  @Get('staff')
  @Needs('staff')
  async staff() {
    const rows = await this.db.admins.findMany({ orderBy: [{ role: 'asc' }, { name: 'asc' }] });
    return rows.map(r => ({
      id: Number(r.id), login: r.login, name: r.name, role: r.role,
      perms: r.perms, isActive: r.is_active, lastLoginAt: r.last_login_at,
    }));
  }

  /** Завести сотрудника или изменить его. Пароль задаётся только здесь
   *  и обратно не читается: в базе лежит хэш. */
  @Post('staff')
  @Needs('staff')
  async saveStaff(@Req() req: any, @Body() body: Partial<{
    id: number; login: string; name: string; password: string;
    perms: string[]; isActive: boolean;
  }>) {
    const me: Admin = req.admin;
    const perms = (body.perms ?? []).filter((p): p is Perm => p in PERMS);

    if (body.id) {
      const row = await this.db.admins.findUnique({ where: { id: BigInt(body.id) } });
      if (!row) throw new NotFoundException('Сотрудник не найден');

      const data: any = {};
      if (body.name != null) data.name = String(body.name).trim().slice(0, 80) || row.name;
      if (body.password) data.password_hash = await this.auth.hash(checkPassword(body.password));

      if (row.role === 'owner') {
        // У владельца права снять нельзя — иначе клуб останется без хозяина
        if (body.isActive === false) throw new BadRequestException('Владельца нельзя выключить');
      } else {
        if (body.perms != null) data.perms = perms;
        if (body.isActive != null) data.is_active = !!body.isActive;
      }

      const saved = await this.db.admins.update({ where: { id: row.id }, data });
      // Сняли права или выключили — входы закрываем сразу, не дожидаясь,
      // пока истечёт токен
      if (body.perms != null || body.isActive === false || body.password) {
        await this.auth.dropSessions(Number(row.id));
      }
      await this.auth.log(me, 'изменил сотрудника', saved.name);
      return { id: Number(saved.id) };
    }

    const login = String(body.login ?? '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(login)) {
      throw new BadRequestException('Логин: 3–32 знака, латиница, цифры, точка, дефис');
    }
    const name = String(body.name ?? '').trim().slice(0, 80);
    if (!name) throw new BadRequestException('Впишите имя сотрудника');
    if (await this.db.admins.findUnique({ where: { login } })) {
      throw new BadRequestException('Такой логин уже занят');
    }

    const created = await this.db.admins.create({ data: {
      login, name, role: 'staff', perms,
      password_hash: await this.auth.hash(checkPassword(body.password ?? '')),
    }});
    await this.auth.log(me, 'завёл сотрудника', `${name} (${login})`);
    return { id: Number(created.id) };
  }

  @Post('staff/:id/delete')
  @Needs('staff')
  async deleteStaff(@Req() req: any, @Param('id') id: string) {
    const row = await this.db.admins.findUnique({ where: { id: BigInt(id) } });
    if (!row) throw new NotFoundException('Сотрудник не найден');
    if (row.role === 'owner') throw new BadRequestException('Владельца удалить нельзя');
    await this.db.admins.delete({ where: { id: row.id } });
    await this.auth.log(req.admin, 'удалил сотрудника', row.name);
    return { ok: true };
  }

  /** Журнал: кто и что делал. Видит тот, кто управляет сотрудниками. */
  @Get('log')
  @Needs('staff')
  async logList() {
    const rows = await this.db.admin_log.findMany({
      orderBy: { created_at: 'desc' }, take: 200,
    });
    return rows.map(r => ({
      id: Number(r.id), name: r.admin_name, action: r.action,
      details: r.details, at: r.created_at,
    }));
  }

  /** День менеджера: все заявки и брони на дату, по времени. */
  @Get('day')
  async day(@Query('date') date?: string) {
    const d = date || clubToday();
    if (!isValidDate(d)) throw new BadRequestException('Дата в виде ГГГГ-ММ-ДД');

    await this.club.releaseExpired();
    const set = await this.club.get();
    const rows = await this.db.bookings.findMany({
      where: { starts_at: { gte: clubHour(d, 0), lt: clubHour(d, 24) } },
      orderBy: [{ starts_at: 'asc' }, { court_id: 'asc' }],
    });
    const [courts, clients, paid] = await Promise.all([
      this.db.courts.findMany({ orderBy: { sort_order: 'asc' } }),
      this.db.clients.findMany({ where: { id: { in: rows.map(r => r.client_id!).filter(Boolean) } } }),
      this.db.payments.groupBy({
        by: ['booking_id'], where: { booking_id: { in: rows.map(r => r.id) } },
        _sum: { amount: true },
      }),
    ]);
    const byId = new Map(clients.map(c => [String(c.id), c]));
    const paidBy = new Map(paid.map(p => [String(p.booking_id), p._sum.amount ?? 0]));

    return {
      date: d,
      openHour: set.openHour,
      closeHour: set.closeHour,
      courts: courts.map(c => ({
        id: c.id, name: c.name, isActive: c.is_active,
        closedUntil: c.closed_until, closedReason: c.closed_reason,
      })),
      bookings: rows.map(b => {
        const cl = b.client_id ? byId.get(String(b.client_id)) : null;
        return {
          id: Number(b.id), courtId: b.court_id,
          hour: hourOf(b.starts_at),
          hours: Math.round((+b.ends_at - +b.starts_at) / 3600_000),
          price: b.price, status: b.status, source: b.source,
          comment: b.comment, createdAt: b.created_at,
          guestName: b.guest_name,
          paid: paidBy.get(String(b.id)) ?? 0,
          statusAt: b.status_at, statusBy: b.status_by,
          holdUntil: b.hold_until,
          players: b.players, discount: b.discount, discountReason: b.discount_reason,
          createdBy: b.created_by,
          client: cl ? {
            id: Number(cl.id), name: [cl.name, cl.surname].filter(Boolean).join(' '),
            phone: cl.phone, whatsapp: cl.whatsapp,
            cancels: cl.cancels, noShows: cl.no_shows, note: cl.note,
          } : null,
        };
      }),
    };
  }

  /** Подтвердить, отменить или отметить, что не пришёл. */
  @Post('bookings/:id/status')
  async setStatus(@Req() req: any, @Param('id') id: string, @Body() dto: StatusDto) {
    const b = await this.db.bookings.findUnique({ where: { id: BigInt(id) } });
    if (!b) throw new NotFoundException('Запись не найдена');

    // Отмена и неявка бьют по клиенту и по выручке — отдельное право
    if ((dto.status === 'cancelled' || dto.status === 'no_show')
        && !this.auth.can(req.admin, 'cancel')) {
      throw new ForbiddenException('Нет доступа: отменять брони и отмечать неявку');
    }

    const ops: any[] = [
      this.db.bookings.update({ where: { id: b.id }, data: {
        status: dto.status, status_at: new Date(), status_by: req.admin.login,
        // Подтвердили — место больше не «на удержании», срок снимаем
        hold_until: dto.status === 'confirmed' ? null : b.hold_until,
      }}),
    ];
    // История поведения клиента: менеджер должен видеть, кто часто пропадает
    if (b.client_id && b.status !== dto.status) {
      if (dto.status === 'no_show') {
        ops.push(this.db.clients.update({
          where: { id: b.client_id }, data: { no_shows: { increment: 1 } } }));
      } else if (dto.status === 'cancelled') {
        ops.push(this.db.clients.update({
          where: { id: b.client_id }, data: { cancels: { increment: 1 } } }));
      }
    }
    await this.db.$transaction(ops);
    await this.auth.log(req.admin, STATUS_WORD[dto.status] ?? dto.status,
      `бронь №${Number(b.id)}`);
    return { id: Number(b.id), status: dto.status };
  }

  /** Скидка постоянному или по договорённости. Цена по прайсу остаётся —
   *  иначе потом не понять, почему сумма не сошлась. */
  @Post('bookings/:id/discount')
  @Needs('prices')
  async discount(@Req() req: any, @Param('id') id: string, @Body() body: {
    amount?: number; reason?: string;
  }) {
    const b = await this.db.bookings.findUnique({ where: { id: BigInt(id) } });
    if (!b) throw new NotFoundException('Запись не найдена');
    const amount = rubToKop(Math.max(0, Number(body.amount ?? 0)));
    if (amount > b.price) throw new BadRequestException('Скидка больше цены');
    const reason = body.reason ? String(body.reason).trim().slice(0, 200) : null;
    if (amount > 0 && !reason) throw new BadRequestException('Напишите причину скидки');

    await this.db.bookings.update({ where: { id: b.id }, data: {
      discount: amount, discount_reason: amount > 0 ? reason : null,
    }});
    await this.auth.log(req.admin, amount > 0 ? 'дал скидку' : 'убрал скидку',
      `бронь №${Number(b.id)}, ${(amount / 100).toLocaleString('ru-RU')} ₽${reason ? ', ' + reason : ''}`);
    return { ok: true };
  }

  /** Сколько человек играло. Падел — четверо, футбол — десять;
   *  без этого нет ни трафика, ни выручки на человека. */
  @Post('bookings/:id/players')
  async setPlayers(@Req() req: any, @Param('id') id: string, @Body() body: { players?: number }) {
    const b = await this.db.bookings.findUnique({ where: { id: BigInt(id) } });
    if (!b) throw new NotFoundException('Запись не найдена');
    const n = body.players == null ? null : int(body.players, 0, 1, 30) || null;
    await this.db.bookings.update({ where: { id: b.id }, data: { players: n } });
    return { ok: true, players: n };
  }

  /** Платежи по броне: их бывает несколько — на корте четверо,
   *  и скидываются они не одновременно. */
  @Get('bookings/:id/payments')
  async payments(@Param('id') id: string) {
    const rows = await this.db.payments.findMany({
      where: { booking_id: BigInt(id) }, orderBy: { created_at: 'asc' },
    });
    return rows.map(r => ({
      id: Number(r.id), amount: r.amount, method: r.method, kind: r.kind,
      receipt: r.receipt, note: r.note, by: r.admin_name, at: r.created_at,
    }));
  }

  /** Принять деньги. Отдельного права не нужно — это работа стойки,
   *  но записывается, кто именно принял. */
  @Post('bookings/:id/pay')
  async pay(@Req() req: any, @Param('id') id: string, @Body() body: {
    amount?: number; method?: string; kind?: string; receipt?: string; note?: string;
  }) {
    const b = await this.db.bookings.findUnique({ where: { id: BigInt(id) } });
    if (!b) throw new NotFoundException('Запись не найдена');

    const method = String(body.method ?? 'cash');
    if (!PAY_METHODS.includes(method)) throw new BadRequestException('Такого способа оплаты нет');
    const kind = String(body.kind ?? 'payment');
    if (!PAY_KINDS.includes(kind)) throw new BadRequestException('Неизвестный вид платежа');

    let amount = rubToKop(Math.abs(Number(body.amount ?? 0)));
    if (amount === 0) throw new BadRequestException('Сумма не может быть нулевой');
    // Возврат хранится минусом: так остаётся след, кто и когда вернул деньги
    if (kind === 'refund') amount = -amount;

    const paid = await this.paidOf(b.id);
    if (kind !== 'refund' && paid + amount > b.price * 3) {
      throw new BadRequestException('Сумма сильно больше цены — похоже на ошибку');
    }
    if (kind === 'refund' && paid + amount < 0) {
      throw new BadRequestException('Вернуть больше, чем получено, нельзя');
    }

    await this.db.payments.create({ data: {
      booking_id: b.id, amount, method, kind,
      receipt: body.receipt ? String(body.receipt).trim().slice(0, 40) : null,
      note: body.note ? String(body.note).trim().slice(0, 200) : null,
      admin_id: BigInt(req.admin.id), admin_name: req.admin.name,
    }});
    await this.auth.log(req.admin, KIND_WORD[kind],
      `бронь №${Number(b.id)}, ${(Math.abs(amount) / 100).toLocaleString('ru-RU')} ₽, ${PAY_WORD[method]}`);
    return { ok: true, paid: paid + amount, price: b.price };
  }

  /** Убрать ошибочный платёж. Это исправление, а не рядовое действие. */
  @Post('payments/:id/delete')
  @Needs('cancel')
  async deletePayment(@Req() req: any, @Param('id') id: string) {
    const row = await this.db.payments.findUnique({ where: { id: BigInt(id) } });
    if (!row) throw new NotFoundException('Платёж не найден');
    await this.db.payments.delete({ where: { id: row.id } });
    await this.auth.log(req.admin, 'удалил платёж',
      `бронь №${Number(row.booking_id)}, ${(row.amount / 100).toLocaleString('ru-RU')} ₽`);
    return { ok: true };
  }

  /** Сколько уже получено по броне. */
  private async paidOf(bookingId: bigint): Promise<number> {
    const r = await this.db.payments.aggregate({
      where: { booking_id: bookingId }, _sum: { amount: true },
    });
    return r._sum.amount ?? 0;
  }

  /** Поиск по имени и телефону сразу по всем датам.
   *  Без него на вопрос «я Ахмед, во сколько у меня бронь?» ответить нечем:
   *  менеджер листал дни по одному и искал глазами. */
  @Get('search')
  async search(@Query('q') q?: string) {
    const text = (q ?? '').trim();
    if (text.length < 2) throw new BadRequestException('Нужно хотя бы две буквы или цифры');

    const digits = text.replace(/\D/g, '');
    const clients = await this.db.clients.findMany({
      where: {
        OR: [
          { name: { contains: text, mode: 'insensitive' } },
          ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
        ],
      },
      take: 40,
    });

    const rows = await this.db.bookings.findMany({
      where: {
        OR: [
          ...(clients.length ? [{ client_id: { in: clients.map(c => c.id) } }] : []),
          { guest_name: { contains: text, mode: 'insensitive' as const } },
        ],
      },
      orderBy: { starts_at: 'desc' },
      take: 60,
    });

    const courts = await this.db.courts.findMany();
    const courtName = new Map(courts.map(c => [c.id, c.name]));
    const byId = new Map(clients.map(c => [String(c.id), c]));

    return rows.map(b => {
      const cl = b.client_id ? byId.get(String(b.client_id)) : null;
      return {
        id: Number(b.id), courtId: b.court_id, courtName: courtName.get(b.court_id) ?? b.court_id,
        date: this.dateOf(b.starts_at), hour: hourOf(b.starts_at),
        hours: Math.round((+b.ends_at - +b.starts_at) / 3600_000),
        price: b.price, status: b.status,
        name: cl?.name ?? b.guest_name ?? 'Без имени',
        phone: cl?.phone ?? null,
      };
    });
  }

  /** Заявки, ждущие подтверждения, по всем датам сразу.
   *  Раньше счётчик считал только открытый день, и заявка на будущую дату
   *  висела неподтверждённой, пока кто-то случайно не откроет тот день. */
  @Get('pending')
  async pending() {
    const rows = await this.db.bookings.findMany({
      where: { status: 'pending', starts_at: { gte: new Date() } },
      orderBy: { starts_at: 'asc' },
      take: 100,
    });
    const [courts, clients] = await Promise.all([
      this.db.courts.findMany(),
      this.db.clients.findMany({ where: { id: { in: rows.map(r => r.client_id!).filter(Boolean) } } }),
    ]);
    const courtName = new Map(courts.map(c => [c.id, c.name]));
    const byId = new Map(clients.map(c => [String(c.id), c]));

    return rows.map(b => {
      const cl = b.client_id ? byId.get(String(b.client_id)) : null;
      return {
        id: Number(b.id), courtId: b.court_id, courtName: courtName.get(b.court_id) ?? b.court_id,
        date: this.dateOf(b.starts_at), hour: hourOf(b.starts_at),
        hours: Math.round((+b.ends_at - +b.starts_at) / 3600_000),
        price: b.price, createdAt: b.created_at,
        name: cl?.name ?? b.guest_name ?? 'Без имени',
        phone: cl?.phone ?? null,
      };
    });
  }

  /** Перенести бронь на другой корт или час.
   *  Отдельная операция, а не «отменить и создать заново»: при обходе
   *  клиент оставался без корта, если новое время оказывалось занято,
   *  и получал отмену в свою карточку ни за что. */
  @Post('bookings/:id/move')
  async move(@Param('id') id: string, @Body() body: {
    courtId: string; date: string; hour: number; hours?: number;
  }) {
    const b = await this.db.bookings.findUnique({ where: { id: BigInt(id) } });
    if (!b) throw new NotFoundException('Запись не найдена');
    if (!isValidDate(body.date)) throw new BadRequestException('Дата в виде ГГГГ-ММ-ДД');

    const court = await this.db.courts.findUnique({ where: { id: body.courtId } });
    if (!court) throw new NotFoundException('Площадка не найдена');
    if (court.closed_until && court.closed_until > new Date()) {
      throw new BadRequestException(court.closed_reason ?? 'Площадка закрыта');
    }

    const pricing = await this.club.pricing();
    const set = pricing.settings;
    const hoursCount = Math.trunc(
      body.hours ?? Math.round((+b.ends_at - +b.starts_at) / 3600_000));
    if (body.hour < set.openHour || hoursCount < 1 || body.hour + hoursCount > set.closeHour) {
      throw new BadRequestException('Время не помещается в рабочий день');
    }

    const price = pricing.span(court, weekdayOf(body.date), body.hour, hoursCount);

    try {
      // Одна операция обновления: старое место освобождается только вместе
      // с занятием нового, промежуточного состояния «нигде» не бывает.
      await this.db.bookings.update({ where: { id: b.id }, data: {
        court_id: court.id,
        starts_at: clubHour(body.date, body.hour),
        ends_at: clubHour(body.date, body.hour + hoursCount),
        price,
      }});
      return { id: Number(b.id), price };
    } catch (e: any) {
      if (String(e?.message).includes('23P01')) {
        throw new BadRequestException('Это время уже занято — бронь осталась на старом месте');
      }
      throw e;
    }
  }

  /* ── история записей ────────────────────────────────────────────────
     Раньше прошлое было доступно только перелистыванием дней по одному.
     Здесь любой период, фильтры и итоги — это и есть «что было». */

  @Get('history')
  async history(@Query() q: {
    from?: string; to?: string; status?: string; courtId?: string;
    paid?: string; source?: string; search?: string; limit?: string; offset?: string;
  }) {
    const from = q.from && isValidDate(q.from) ? q.from : shiftDate(clubToday(), -30);
    const to   = q.to   && isValidDate(q.to)   ? q.to   : clubToday();
    if (from > to) throw new BadRequestException('Начало периода позже конца');

    const where: any = {
      starts_at: { gte: clubHour(from, 0), lt: clubHour(shiftDate(to, 1), 0) },
    };
    if (q.status && q.status !== 'all') where.status = q.status as any;
    if (q.courtId) where.court_id = q.courtId;
    if (q.paid === 'yes') where.payments = { some: {} };
    if (q.paid === 'no') where.payments = { none: {} };
    if (q.source === 'app' || q.source === 'admin') where.source = q.source;

    const text = (q.search ?? '').trim();
    if (text.length >= 2) {
      const digits = text.replace(/\D/g, '');
      const clients = await this.db.clients.findMany({
        where: { OR: [
          { name: { contains: text, mode: 'insensitive' } },
          ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
        ]},
        select: { id: true },
      });
      where.OR = [
        ...(clients.length ? [{ client_id: { in: clients.map(c => c.id) } }] : []),
        { guest_name: { contains: text, mode: 'insensitive' as const } },
      ];
    }

    const take = Math.min(500, Math.max(1, Number(q.limit) || 100));
    const skip = Math.max(0, Number(q.offset) || 0);

    const [rows, total, charged, received] = await Promise.all([
      this.db.bookings.findMany({ where, orderBy: { starts_at: 'desc' }, take, skip }),
      this.db.bookings.count({ where }),
      // Итоги по всему периоду, а не по показанной странице
      this.db.bookings.aggregate({ where, _sum: { price: true } }),
      this.db.payments.aggregate({
        where: { bookings: where }, _sum: { amount: true },
      }),
    ]);

    const [courts, clients, paid] = await Promise.all([
      this.db.courts.findMany(),
      this.db.clients.findMany({ where: { id: { in: rows.map(r => r.client_id!).filter(Boolean) } } }),
      this.db.payments.groupBy({
        by: ['booking_id'], where: { booking_id: { in: rows.map(r => r.id) } },
        _sum: { amount: true },
      }),
    ]);
    const courtName = new Map(courts.map(c => [c.id, c.name]));
    const byId = new Map(clients.map(c => [String(c.id), c]));
    const paidBy = new Map(paid.map(p => [String(p.booking_id), p._sum.amount ?? 0]));

    return {
      total, from, to,
      charged: charged._sum.price ?? 0,
      received: received._sum.amount ?? 0,
      rows: rows.map(b => {
        const cl = b.client_id ? byId.get(String(b.client_id)) : null;
        return {
          id: Number(b.id),
          date: this.dateOf(b.starts_at), hour: hourOf(b.starts_at),
          hours: Math.round((+b.ends_at - +b.starts_at) / 3600_000),
          courtId: b.court_id, courtName: courtName.get(b.court_id) ?? b.court_id,
          name: cl?.name ?? b.guest_name ?? 'Без имени',
          phone: cl?.phone ?? null,
          price: b.price, status: b.status, source: b.source,
          paid: paidBy.get(String(b.id)) ?? 0,
          statusAt: b.status_at, statusBy: b.status_by,
          holdUntil: b.hold_until,
          players: b.players, discount: b.discount, discountReason: b.discount_reason,
          createdBy: b.created_by,
          comment: b.comment,
        };
      }),
    };
  }

  /* ── аналитика ──────────────────────────────────────────────────────
     Главный вопрос руководителя — окупается ли клуб и куда бить.
     Считаем по броням, которые состоялись: отменённые не в счёт. */

  @Get('stats')
  async stats(@Query('from') fromQ?: string, @Query('to') toQ?: string) {
    const to   = toQ   && isValidDate(toQ)   ? toQ   : clubToday();
    const from = fromQ && isValidDate(fromQ) ? fromQ : shiftDate(to, -29);
    if (from > to) throw new BadRequestException('Начало периода позже конца');

    const days = Math.round(
      (+new Date(to + 'T00:00:00Z') - +new Date(from + 'T00:00:00Z')) / 864e5) + 1;
    // Прошлый период такой же длины — иначе сравнивать не с чем
    const prevTo = shiftDate(from, -1);
    const prevFrom = shiftDate(prevTo, -(days - 1));

    const [set, courts] = await Promise.all([
      this.club.get(),
      this.db.courts.findMany({ orderBy: { sort_order: 'asc' } }),
    ]);
    const openCourts = courts.filter(c => c.is_active).length || 1;
    const dayHours = Math.max(1, set.closeHour - set.openHour);
    const EVENING = 18;
    const eveningHours = Math.max(1, set.closeHour - EVENING);

    const load = async (a: string, b: string) => this.db.bookings.findMany({
      where: { starts_at: { gte: clubHour(a, 0), lt: clubHour(shiftDate(b, 1), 0) } },
      select: {
        id: true, court_id: true, client_id: true, starts_at: true, ends_at: true,
        status: true, price: true, source: true, created_at: true,
        discount: true, players: true, status_at: true,
      },
    });

    /** Платежи периода, разложенные по броням и по способам. */
    const money = async (a: string, b: string) => this.db.payments.findMany({
      where: { bookings: { starts_at: { gte: clubHour(a, 0), lt: clubHour(shiftDate(b, 1), 0) } } },
      select: { booking_id: true, amount: true, method: true, kind: true },
    });

    /** Прочие продажи периода: бар, прокат, тренировки. */
    const otherSales = async (a: string, b: string) => this.db.sales.findMany({
      where: { day: { gte: new Date(a), lte: new Date(b) } },
      select: { category: true, amount: true, method: true },
    });
    /** Расходы месяцев, попавших в период. */
    const costs = async (a: string, b: string) => this.db.expenses.findMany({
      where: { month: { gte: new Date(a.slice(0, 7) + '-01'), lte: new Date(b.slice(0, 7) + '-01') } },
      select: { category: true, amount: true },
    });

    const [rows, prevRows, pays, prevPays, sales, prevSales, exp, prevExp] = await Promise.all([
      load(from, to), load(prevFrom, prevTo), money(from, to), money(prevFrom, prevTo),
      otherSales(from, to), otherSales(prevFrom, prevTo), costs(from, to), costs(prevFrom, prevTo),
    ]);
    const paidTotal = (list: { amount: number }[]) => list.reduce((n, p) => n + p.amount, 0);

    /** Свод по набору броней. */
    const sum = (list: typeof rows, payList: { amount: number }[]) => {
      const live = list.filter(b => b.status !== 'cancelled');
      const played = live.filter(b => b.status !== 'no_show');
      const hoursOf = (b: typeof rows[number]) =>
        Math.round((+b.ends_at - +b.starts_at) / 3600_000);
      const bookedHours = played.reduce((n, b) => n + hoursOf(b), 0);
      return {
        bookings: live.length,
        hours: bookedHours,
        // Начислено с учётом ручных скидок: иначе цифра расходится с кассой
        charged: played.reduce((n, b) => n + b.price - b.discount, 0),
        received: paidTotal(payList),
        cancels: list.filter(b => b.status === 'cancelled').length,
        noShows: list.filter(b => b.status === 'no_show').length,
      };
    };

    const now = sum(rows, pays);
    const prev = sum(prevRows, prevPays);

    const salesTotal = (list: { amount: number }[]) => list.reduce((n, x) => n + x.amount, 0);
    const otherRevenue = salesTotal(sales);
    const prevOther = salesTotal(prevSales);
    const spent = exp.reduce((n, x) => n + x.amount, 0);
    const prevSpent = prevExp.reduce((n, x) => n + x.amount, 0);

    const hoursOf = (b: typeof rows[number]) => Math.round((+b.ends_at - +b.starts_at) / 3600_000);
    const played = rows.filter(b => b.status !== 'cancelled' && b.status !== 'no_show');

    // Загрузка: сколько часов продано из всех, что были в продаже
    const capacity = openCourts * dayHours * days;
    const eveningCapacity = openCourts * eveningHours * days;
    let eveningSold = 0;
    const byHour = new Map<number, { hours: number; revenue: number }>();
    const byCourt = new Map<string, { hours: number; revenue: number }>();
    const byWeekday = new Map<number, { hours: number; revenue: number }>();

    for (const b of played) {
      const start = hourOf(b.starts_at);
      const n = hoursOf(b);
      const perHour = n > 0 ? Math.round(b.price / n) : b.price;
      const wd = weekdayOf(this.dateOf(b.starts_at));
      for (let i = 0; i < n; i++) {
        const h = start + i;
        if (h >= EVENING) eveningSold++;
        const cur = byHour.get(h) ?? { hours: 0, revenue: 0 };
        byHour.set(h, { hours: cur.hours + 1, revenue: cur.revenue + perHour });
      }
      const c = byCourt.get(b.court_id) ?? { hours: 0, revenue: 0 };
      byCourt.set(b.court_id, { hours: c.hours + n, revenue: c.revenue + b.price });
      const w = byWeekday.get(wd) ?? { hours: 0, revenue: 0 };
      byWeekday.set(wd, { hours: w.hours + n, revenue: w.revenue + b.price });
    }

    // Кто платил и чем: СБП отдельно от карты — комиссии разные
    const byMethod: Record<string, number> = Object.fromEntries(PAY_METHODS.map(m => [m, 0]));
    let refunded = 0, penalties = 0;
    for (const p of pays) {
      byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;
      if (p.kind === 'refund') refunded += -p.amount;
      if (p.kind === 'penalty') penalties += p.amount;
    }

    // Тепловая карта «час × день недели» — по ней видно, где провал
    const heat = new Map<string, number>();
    for (const b of played) {
      const start = hourOf(b.starts_at);
      const wd = weekdayOf(this.dateOf(b.starts_at));
      for (let i = 0; i < hoursOf(b); i++) {
        const k = `${wd}:${start + i}`;
        heat.set(k, (heat.get(k) ?? 0) + 1);
      }
    }
    // Сколько раз каждый день недели попал в период — иначе доля соврёт
    const weekdayCount = new Map<number, number>();
    for (let i = 0; i < days; i++) {
      const wd = weekdayOf(shiftDate(from, i));
      weekdayCount.set(wd, (weekdayCount.get(wd) ?? 0) + 1);
    }

    // Упущенное: отменённые и неявочные часы в рублях
    const lost = rows.filter(b => b.status === 'cancelled' || b.status === 'no_show')
      .reduce((n, b) => n + b.price, 0);

    // Поздние отмены — те, что пришли позже бесплатной границы.
    // Считать их стало можно только с тех пор, как пишется время смены статуса.
    const lateCancels = rows.filter(b =>
      b.status === 'cancelled' && b.status_at != null &&
      +b.starts_at - +b.status_at < set.cancelHours * 3600_000).length;

    // Сколько человек побывало и сколько принёс каждый
    const guests = played.reduce((n, b) => n + (b.players ?? 0), 0);
    const withPlayers = played.filter(b => b.players != null).length;
    const discounts = rows.filter(b => b.status !== 'cancelled')
      .reduce((n, b) => n + b.discount, 0);

    // За сколько дней вперёд бронируют — от этого зависит, как далеко
    // открывать расписание и когда слать напоминания
    const depths = played.map(b =>
      Math.max(0, Math.round((+b.starts_at - +b.created_at) / 864e5)));
    const bookingDepth = depths.length
      ? Math.round(depths.reduce((a, b) => a + b, 0) / depths.length * 10) / 10 : 0;

    // Постоянные клиенты
    const perClient = new Map<string, { visits: number; spent: number; last: Date }>();
    for (const b of played) {
      if (!b.client_id) continue;
      const k = String(b.client_id);
      const cur = perClient.get(k) ?? { visits: 0, spent: 0, last: b.starts_at };
      perClient.set(k, {
        visits: cur.visits + 1,
        spent: cur.spent + b.price,
        last: b.starts_at > cur.last ? b.starts_at : cur.last,
      });
    }
    const topIds = [...perClient.entries()]
      .sort((a, b) => b[1].spent - a[1].spent).slice(0, 10);
    const topClients = topIds.length
      ? (await this.db.clients.findMany({ where: { id: { in: topIds.map(([k]) => BigInt(k)) } } }))
          .map(c => {
            const d = perClient.get(String(c.id))!;
            return { name: c.name, phone: c.phone, visits: d.visits, spent: d.spent,
                     lastVisit: d.last };
          })
          .sort((a, b) => b.spent - a.spent)
      : [];

    const repeat = [...perClient.values()].filter(v => v.visits > 1).length;

    // Новый клиент — тот, у кого до этого периода не было ни одной игры.
    // Много новых и мало вернувшихся значит реклама работает, а клуб нет.
    const ids = [...perClient.keys()].map(k => BigInt(k));
    const seenBefore = ids.length
      ? await this.db.bookings.findMany({
          where: { client_id: { in: ids }, starts_at: { lt: clubHour(from, 0) },
                   status: { not: 'cancelled' } },
          select: { client_id: true }, distinct: ['client_id'],
        })
      : [];
    const old = new Set(seenBefore.map(r => String(r.client_id)));
    const fresh = ids.filter(id => !old.has(String(id))).length;

    return {
      from, to, days,
      prevFrom, prevTo,
      now, prev,
      // Выручка на корт-час: сколько приносит один час одной площадки в среднем,
      // включая пустые часы. Главная цифра для сравнения периодов.
      revPerCourtHour: capacity ? Math.round(now.charged / capacity) : 0,
      averageCheck: now.bookings ? Math.round(now.charged / now.bookings) : 0,
      occupancy: capacity ? now.hours / capacity : 0,
      eveningOccupancy: eveningCapacity ? eveningSold / eveningCapacity : 0,
      unpaid: now.charged - now.received,
      byMethod, refunded, penalties, lost, bookingDepth, lateCancels, discounts,
      // Деньги клуба целиком: аренда кортов плюс бар, прокат и тренировки,
      // минус расходы месяцев, попавших в период
      otherRevenue, prevOther, spent, prevSpent,
      profit: now.charged + otherRevenue - spent,
      prevProfit: prev.charged + prevOther - prevSpent,
      byExpense: groupSum(exp),
      bySale: groupSum(sales),
      guests, guestsKnown: withPlayers, playedCount: played.length,
      revPerGuest: guests ? Math.round(now.charged / guests) : 0,
      heat: Array.from({ length: 7 }, (_, w) => ({
        weekday: w + 1,
        days: weekdayCount.get(w + 1) ?? 0,
        hours: Array.from({ length: set.closeHour - set.openHour }, (_, i) => {
          const h = set.openHour + i;
          const sold = heat.get(`${w + 1}:${h}`) ?? 0;
          const cap = (weekdayCount.get(w + 1) ?? 0) * openCourts;
          return { hour: h, sold, load: cap ? sold / cap : 0 };
        }),
      })),
      openHour: set.openHour, closeHour: set.closeHour, eveningFrom: EVENING,
      byHour: Array.from({ length: set.closeHour - set.openHour }, (_, i) => {
        const h = set.openHour + i;
        const v = byHour.get(h) ?? { hours: 0, revenue: 0 };
        const cap = openCourts * days;
        return { hour: h, hours: v.hours, revenue: v.revenue, load: cap ? v.hours / cap : 0 };
      }),
      byCourt: courts.map(c => {
        const v = byCourt.get(c.id) ?? { hours: 0, revenue: 0 };
        const cap = dayHours * days;
        return { id: c.id, name: c.name, hours: v.hours, revenue: v.revenue,
                 load: cap ? v.hours / cap : 0, isActive: c.is_active };
      }),
      byWeekday: Array.from({ length: 7 }, (_, i) => {
        const wd = i + 1;
        const v = byWeekday.get(wd) ?? { hours: 0, revenue: 0 };
        return { weekday: wd, hours: v.hours, revenue: v.revenue };
      }),
      sources: {
        app: rows.filter(b => b.source === 'app' && b.status !== 'cancelled').length,
        admin: rows.filter(b => b.source !== 'app' && b.status !== 'cancelled').length,
      },
      clients: { total: perClient.size, repeat, fresh, returning: perClient.size - fresh },
      topClients,
    };
  }

  /* ── расходы и прочие продажи ───────────────────────────────────────
     Без расходов вопрос «окупается ли клуб» не имеет ответа в системе:
     видно только оборот. Прочие продажи — бар, прокат, тренировки —
     тоже деньги клуба, а завести их было негде. */

  @Get('expenses')
  @Needs('prices')
  async expenses(@Query('from') from?: string, @Query('to') to?: string) {
    const where: any = {};
    if (from && isValidDate(from)) where.month = { gte: new Date(from.slice(0, 7) + '-01') };
    if (to && isValidDate(to)) {
      where.month = { ...(where.month ?? {}), lte: new Date(to.slice(0, 7) + '-01') };
    }
    const rows = await this.db.expenses.findMany({ where, orderBy: [{ month: 'desc' }, { id: 'desc' }] });
    return rows.map(r => ({
      id: Number(r.id), month: r.month.toISOString().slice(0, 7),
      category: r.category, amount: r.amount, note: r.note, by: r.admin_name,
    }));
  }

  @Post('expenses')
  @Needs('prices')
  async saveExpense(@Req() req: any, @Body() body: {
    id?: number; month?: string; category?: string; amount?: number; note?: string;
  }) {
    const CATS = ['rent', 'salary', 'utilities', 'loan', 'marketing', 'equipment', 'tax', 'other'];
    const category = String(body.category ?? 'other');
    if (!CATS.includes(category)) throw new BadRequestException('Неизвестная статья расходов');
    const m = String(body.month ?? '');
    if (!/^\d{4}-\d{2}$/.test(m)) throw new BadRequestException('Месяц в виде ГГГГ-ММ');
    const amount = rubToKop(body.amount);
    if (amount <= 0) throw new BadRequestException('Сумма должна быть больше нуля');

    const data = {
      month: new Date(m + '-01'), category, amount,
      note: body.note ? String(body.note).trim().slice(0, 200) : null,
      admin_id: BigInt(req.admin.id), admin_name: req.admin.name,
    };
    const r = body.id
      ? await this.db.expenses.update({ where: { id: BigInt(body.id) }, data })
      : await this.db.expenses.create({ data });
    await this.auth.log(req.admin, 'записал расход',
      `${m}, ${EXPENSE_WORD[category]}, ${(amount / 100).toLocaleString('ru-RU')} ₽`);
    return { id: Number(r.id) };
  }

  @Post('expenses/:id/delete')
  @Needs('prices')
  async deleteExpense(@Req() req: any, @Param('id') id: string) {
    await this.db.expenses.delete({ where: { id: BigInt(id) } });
    await this.auth.log(req.admin, 'удалил расход', `№${id}`);
    return { ok: true };
  }

  @Get('sales')
  async sales(@Query('from') from?: string, @Query('to') to?: string) {
    const a = from && isValidDate(from) ? from : shiftDate(clubToday(), -30);
    const b = to && isValidDate(to) ? to : clubToday();
    const rows = await this.db.sales.findMany({
      where: { day: { gte: new Date(a), lte: new Date(b) } },
      orderBy: [{ day: 'desc' }, { id: 'desc' }], take: 300,
    });
    return rows.map(r => ({
      id: Number(r.id), day: r.day.toISOString().slice(0, 10),
      category: r.category, amount: r.amount, method: r.method,
      qty: r.qty, note: r.note, by: r.admin_name,
    }));
  }

  /** Продать воду, прокат ракетки, тренировку. Это работа стойки. */
  @Post('sales')
  async saveSale(@Req() req: any, @Body() body: {
    day?: string; category?: string; amount?: number; method?: string;
    qty?: number; note?: string;
  }) {
    const CATS = ['bar', 'rental', 'coaching', 'shop', 'other'];
    const category = String(body.category ?? 'other');
    if (!CATS.includes(category)) throw new BadRequestException('Неизвестная статья продаж');
    const method = String(body.method ?? 'cash');
    if (!PAY_METHODS.includes(method)) throw new BadRequestException('Такого способа оплаты нет');
    const day = body.day && isValidDate(body.day) ? body.day : clubToday();
    const amount = rubToKop(body.amount);
    if (amount <= 0) throw new BadRequestException('Сумма должна быть больше нуля');

    const r = await this.db.sales.create({ data: {
      day: new Date(day), category, amount, method,
      qty: int(body.qty, 1, 1, 999),
      note: body.note ? String(body.note).trim().slice(0, 200) : null,
      admin_id: BigInt(req.admin.id), admin_name: req.admin.name,
    }});
    await this.auth.log(req.admin, 'продал',
      `${SALE_WORD[category]}, ${(amount / 100).toLocaleString('ru-RU')} ₽`);
    return { id: Number(r.id) };
  }

  @Post('sales/:id/delete')
  @Needs('cancel')
  async deleteSale(@Req() req: any, @Param('id') id: string) {
    await this.db.sales.delete({ where: { id: BigInt(id) } });
    await this.auth.log(req.admin, 'удалил продажу', `№${id}`);
    return { ok: true };
  }

  /** Взнос за турнир. Раньше взнос был записан на турнире,
   *  а факта оплаты не было — «сколько собрано» никто не знал. */
  @Post('entries/:id/pay')
  async payEntry(@Req() req: any, @Param('id') id: string, @Body() body: {
    amount?: number; method?: string;
  }) {
    const e = await this.db.tournament_entries.findUnique({
      where: { id: BigInt(id) }, include: { tournaments: true, clients: true },
    });
    if (!e) throw new NotFoundException('Запись на турнир не найдена');
    const method = String(body.method ?? 'cash');
    if (!PAY_METHODS.includes(method)) throw new BadRequestException('Такого способа оплаты нет');
    const amount = body.amount == null ? e.tournaments.fee : rubToKop(body.amount);

    await this.db.tournament_entries.update({ where: { id: e.id }, data: {
      paid_amount: amount, paid_method: method, paid_at: amount > 0 ? new Date() : null,
    }});
    await this.auth.log(req.admin, 'принял взнос за турнир',
      `${e.clients.name}, ${(amount / 100).toLocaleString('ru-RU')} ₽`);
    return { ok: true };
  }

  /* ── управление клубом ──────────────────────────────────────────────
     Раньше цены, часы, названия площадок и турниры правились только
     в базе руками программиста. Теперь всё это делает менеджер. */

  /** Всё, что можно настроить: площадки целиком и настройки клуба. */
  @Get('setup')
  async setup() {
    const [courts, set] = await Promise.all([
      this.db.courts.findMany({ orderBy: { sort_order: 'asc' } }),
      this.club.get(),
    ]);
    return {
      settings: set,
      courts: courts.map(c => ({
        id: c.id, name: c.name, isFootball: c.is_football,
        priceMorning: c.price_morning, priceStandard: c.price_standard,
        isActive: c.is_active, sortOrder: c.sort_order, description: c.description,
        closedUntil: c.closed_until, closedReason: c.closed_reason,
      })),
    };
  }

  /** Часы работы, граница утреннего тарифа, предельная длина брони. */
  @Post('settings')
  @Needs('club')
  async saveSettings(@Body() body: Partial<{
    openHour: number; closeHour: number; morningUntil: number;
    maxHours: number; cancelHours: number; holdMinutes: number;
  }>) {
    const cur = await this.club.get();
    const next = {
      open_hour: int(body.openHour, cur.openHour, 0, 23),
      close_hour: int(body.closeHour, cur.closeHour, 1, 24),
      morning_until: int(body.morningUntil, cur.morningUntil, 0, 24),
      max_hours: int(body.maxHours, cur.maxHours, 1, 12),
      cancel_hours: int(body.cancelHours, cur.cancelHours, 0, 48),
      hold_minutes: int(body.holdMinutes, cur.holdMinutes, 5, 1440),
    };
    if (next.open_hour >= next.close_hour) {
      throw new BadRequestException('Открытие должно быть раньше закрытия');
    }
    if (next.morning_until < next.open_hour || next.morning_until > next.close_hour) {
      throw new BadRequestException('Граница утреннего тарифа должна быть внутри рабочего дня');
    }
    await this.db.settings.upsert({
      where: { id: 1 },
      update: { ...next, updated_at: new Date() },
      create: { id: 1, ...next },
    });
    this.club.forget();
    return this.club.get();
  }

  /** Название, цены, порядок и включение площадки. */
  @Post('courts/:id')
  @Needs('club')
  async saveCourt(@Param('id') id: string, @Body() body: Partial<{
    name: string; priceMorning: number; priceStandard: number;
    isActive: boolean; sortOrder: number; description: string;
  }>) {
    const court = await this.db.courts.findUnique({ where: { id } });
    if (!court) throw new NotFoundException('Площадка не найдена');

    const data: any = {};
    if (body.name != null) {
      const n = String(body.name).trim();
      if (n.length < 1 || n.length > 60) throw new BadRequestException('Название от 1 до 60 знаков');
      data.name = n;
    }
    // Цены приходят в рублях — так их и вводит менеджер; в базе копейки
    if (body.priceMorning != null) data.price_morning = rubToKop(body.priceMorning);
    if (body.priceStandard != null) data.price_standard = rubToKop(body.priceStandard);
    if (body.isActive != null) data.is_active = !!body.isActive;
    if (body.sortOrder != null) data.sort_order = int(body.sortOrder, court.sort_order, 0, 999);
    if (body.description != null) {
      data.description = String(body.description).trim().slice(0, 1000) || null;
    }

    const c = await this.db.courts.update({ where: { id }, data });
    return { id: c.id, name: c.name, isActive: c.is_active,
             priceMorning: c.price_morning, priceStandard: c.price_standard };
  }

  /** Особые цены: выходные дороже, длинное утро, своя цена одной площадке. */
  @Get('price-rules')
  async priceRules() {
    return (await this.club.rules()).map(r => ({
      id: r.id, courtId: r.courtId, days: r.days,
      fromHour: r.fromHour, toHour: r.toHour, price: r.price,
      note: r.note, sortOrder: r.sortOrder,
    }));
  }

  /** Завести правило или изменить существующее. */
  @Post('price-rules')
  @Needs('prices')
  async savePriceRule(@Body() body: Partial<{
    id: number; courtId: string | null; days: number[] | null;
    fromHour: number; toHour: number; price: number; note: string; sortOrder: number;
  }>) {
    const set = await this.club.get();
    const from = int(body.fromHour, -1, 0, 23);
    const to = int(body.toHour, -1, 1, 24);
    if (from < 0 || to < 0) throw new BadRequestException('Часы должны быть от 0 до 24');
    if (from >= to) throw new BadRequestException('Начало должно быть раньше конца');
    if (from < set.openHour || to > set.closeHour) {
      throw new BadRequestException(
        `Правило должно лежать внутри рабочего дня: ${set.openHour}:00 – ${set.closeHour}:00`);
    }

    let days: number[] | null = null;
    if (Array.isArray(body.days) && body.days.length) {
      days = [...new Set(body.days.map(d => Math.trunc(Number(d))))].sort();
      if (days.some(d => d < 1 || d > 7)) throw new BadRequestException('Дни недели: от 1 до 7');
      if (days.length === 7) days = null;   // все семь — то же, что «любой день»
    }

    let courtId: string | null = null;
    if (body.courtId) {
      const c = await this.db.courts.findUnique({ where: { id: body.courtId } });
      if (!c) throw new NotFoundException('Площадка не найдена');
      courtId = c.id;
    }

    const data = {
      court_id: courtId, days: days ?? [],
      from_hour: from, to_hour: to, price: rubToKop(body.price),
      note: body.note ? String(body.note).trim().slice(0, 120) : null,
      sort_order: int(body.sortOrder, 0, 0, 999),
    };

    const r = body.id
      ? await this.db.price_rules.update({ where: { id: BigInt(body.id) }, data })
      : await this.db.price_rules.create({ data });
    this.club.forget();
    return { id: Number(r.id) };
  }

  /** Убрать правило. Часы под ним возвращаются к обычной цене. */
  @Post('price-rules/:id/delete')
  @Needs('prices')
  async deletePriceRule(@Param('id') id: string) {
    await this.db.price_rules.delete({ where: { id: BigInt(id) } });
    this.club.forget();
    return { ok: true };
  }

  /** Турниры: список с числом записавшихся. */
  @Get('tournaments')
  async tournaments() {
    const rows = await this.db.tournaments.findMany({ orderBy: { starts_at: 'desc' } });
    const counts = await this.db.tournament_entries.groupBy({
      by: ['tournament_id'], _count: { _all: true },
    });
    const taken = new Map(counts.map(c => [String(c.tournament_id), c._count._all]));
    return rows.map(t => ({
      id: Number(t.id), name: t.name, startsAt: t.starts_at, format: t.format,
      fee: t.fee, seats: t.seats, state: t.state, coverUrl: t.cover_url,
      resultText: t.result_text, taken: taken.get(String(t.id)) ?? 0,
      hours: t.hours, courtIds: t.court_ids,
    }));
  }

  /** Кто записался: имя и телефон, чтобы можно было позвонить. */
  @Get('tournaments/:id/entries')
  async entries(@Param('id') id: string) {
    const rows = await this.db.tournament_entries.findMany({
      where: { tournament_id: BigInt(id) },
      orderBy: { created_at: 'asc' },
      include: { clients: true },
    });
    return rows.map(e => ({
      id: Number(e.id), name: e.clients.name, phone: e.clients.phone,
      signedAt: e.created_at,
    }));
  }

  /** Завести турнир или изменить существующий. */
  @Post('tournaments')
  @Needs('tournaments')
  async saveTournament(@Req() req: any, @Body() body: Partial<{
    id: number; name: string; startsAt: string; format: string;
    fee: number; seats: number; state: string; coverUrl: string; resultText: string;
    hours: number; courtIds: string[];
  }>) {
    const STATES = ['soon', 'open', 'closed', 'done'];
    const data: any = {};

    if (body.name != null) {
      const n = String(body.name).trim();
      if (!n || n.length > 120) throw new BadRequestException('Название от 1 до 120 знаков');
      data.name = n;
    }
    if (body.startsAt != null) {
      const d = new Date(body.startsAt);
      if (Number.isNaN(+d)) throw new BadRequestException('Неверная дата начала');
      data.starts_at = d;
    }
    if (body.format != null) data.format = String(body.format).trim().slice(0, 80);
    if (body.fee != null) data.fee = rubToKop(body.fee);
    if (body.seats != null) data.seats = int(body.seats, 16, 2, 200);
    if (body.state != null) {
      if (!STATES.includes(body.state)) throw new BadRequestException('Неизвестное состояние турнира');
      data.state = body.state;
    }
    if (body.hours != null) data.hours = int(body.hours, 3, 1, 15);
    if (body.courtIds != null) {
      const ids = Array.isArray(body.courtIds) ? body.courtIds.map(String) : [];
      const known = await this.db.courts.findMany({ where: { id: { in: ids } }, select: { id: true } });
      if (known.length !== ids.length) throw new BadRequestException('Среди площадок есть неизвестная');
      data.court_ids = ids;
    }
    if (body.coverUrl != null) data.cover_url = String(body.coverUrl).trim().slice(0, 200) || null;
    if (body.resultText != null) data.result_text = String(body.resultText).trim().slice(0, 2000) || null;

    if (body.id) {
      const t = await this.db.tournaments.update({ where: { id: BigInt(body.id) }, data });
      const busy = await this.blockCourts(t);
      return { id: Number(t.id), busy };
    }
    if (!data.name || !data.starts_at) {
      throw new BadRequestException('Для нового турнира нужны название и дата начала');
    }
    const t = await this.db.tournaments.create({ data: {
      name: data.name, starts_at: data.starts_at,
      format: data.format ?? 'Americano', fee: data.fee ?? 0,
      seats: data.seats ?? 16, state: data.state ?? 'soon',
      cover_url: data.cover_url ?? null, result_text: data.result_text ?? null,
      hours: data.hours ?? 3, court_ids: data.court_ids ?? [],
    }});
    const busy = await this.blockCourts(t);
    await this.auth.log(req.admin, 'завёл турнир', t.name);
    return { id: Number(t.id), busy };
  }

  /** Занять корты под турнир.
   *
   *  Занятие делается обычными бронями: тогда запрет на пересечение на уровне
   *  базы работает сам, менеджер видит турнир в сетке дня, а расписание
   *  в приложении показывает эти часы занятыми без отдельной логики.
   *
   *  Возвращает площадки, которые занять не вышло — там уже есть чужая бронь.
   *  Молча пропускать нельзя: клуб будет думать, что корт под турниром. */
  private async blockCourts(t: {
    id: bigint; name: string; starts_at: Date; hours: number; court_ids: string[];
    state: string;
  }): Promise<string[]> {
    // Старые брони этого турнира убираем всегда: состав площадок и время
    // могли поменяться, а отменённый турнир не должен держать корты
    await this.db.bookings.deleteMany({ where: { tournament_id: t.id } });
    if (!t.court_ids.length || t.state === 'done') return [];

    const failed: string[] = [];
    for (const courtId of t.court_ids) {
      try {
        await this.db.bookings.create({ data: {
          court_id: courtId, client_id: null,
          starts_at: t.starts_at,
          ends_at: new Date(+t.starts_at + t.hours * 3600_000),
          price: 0, status: 'confirmed', source: 'tournament',
          guest_name: `Турнир: ${t.name}`,
          tournament_id: t.id,
        }});
      } catch (e: any) {
        // Время уже занято чужой бронью — сказать, а не проглотить
        if (String(e?.message).includes(EXCLUSION) || e?.meta?.code === EXCLUSION) failed.push(courtId);
        else throw e;
      }
    }
    return failed;
  }

  /** Дата брони в часовом поясе клуба, в виде ГГГГ-ММ-ДД. */
  private dateOf(d: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d);
  }

  /** Занять время вручную: пришли без приложения, позвонили, турнир. */
  @Post('bookings')
  async createManual(@Req() req: any, @Body() body: {
    courtId: string; date: string; hour: number; hours: number;
    name?: string; phone?: string; comment?: string; players?: number;
  }) {
    if (!isValidDate(body.date)) throw new BadRequestException('Дата в виде ГГГГ-ММ-ДД');
    const court = await this.db.courts.findUnique({ where: { id: body.courtId } });
    if (!court) throw new NotFoundException('Площадка не найдена');

    // Часы должны лежать внутри рабочего дня: раньше 23:00 на три часа
    // сохранялось и рисовалось в сетке как «23:00 – 26:00».
    const pricing = await this.club.pricing();
    const set = pricing.settings;
    const hoursCount = Math.trunc(body.hours);
    if (!Number.isFinite(body.hour) || body.hour < set.openHour || body.hour >= set.closeHour) {
      throw new BadRequestException(`Час должен быть от ${set.openHour} до ${set.closeHour - 1}`);
    }
    if (hoursCount < 1 || body.hour + hoursCount > set.closeHour) {
      throw new BadRequestException('Игра не помещается до закрытия клуба');
    }

    // Закрытая площадка не должна принимать записи и через админку тоже
    if (court.closed_until && court.closed_until > new Date()) {
      throw new BadRequestException(court.closed_reason ?? 'Площадка закрыта');
    }

    const players = body.players ? int(body.players, 0, 1, 30) || null : null;
    const name = body.name?.trim() || null;
    const phone = normalizePhone(body.phone);
    if (body.phone && !phone) throw new BadRequestException('Номер телефона неполный');

    let clientId: bigint | null = null;
    if (phone) {
      const c = await this.db.clients.upsert({
        where: { phone },
        update: name ? { name } : {},
        create: { phone, name: name ?? 'Без имени' },
      });
      clientId = c.id;
    }

    const price = pricing.span(court, weekdayOf(body.date), body.hour, hoursCount);

    try {
      const b = await this.db.bookings.create({ data: {
        court_id: court.id, client_id: clientId,
        starts_at: clubHour(body.date, body.hour),
        ends_at: clubHour(body.date, body.hour + hoursCount),
        price, status: 'confirmed', source: 'admin', comment: body.comment,
        created_by: req.admin.login, players: players,
        // имя гостя без телефона больше не теряется
        guest_name: clientId == null ? name : null,
      }});
      return { id: Number(b.id) };
    } catch (e: any) {
      if (String(e?.message).includes('23P01')) {
        throw new BadRequestException('Это время уже занято');
      }
      throw e;
    }
  }

  /** Закрыть площадку на ремонт или открыть обратно. */
  @Post('courts/:id/close')
  @Needs('club')
  async closeCourt(@Param('id') id: string, @Body() dto: CloseCourtDto) {
    const court = await this.db.courts.findUnique({ where: { id } });
    if (!court) throw new NotFoundException('Площадка не найдена');
    const until = dto.until ? new Date(dto.until) : null;
    if (dto.until && Number.isNaN(+until!)) throw new BadRequestException('Неверная дата');
    await this.db.courts.update({
      where: { id },
      data: { closed_until: until, closed_reason: until ? (dto.reason ?? 'Закрыт') : null },
    });
    return { id, closedUntil: until, closedReason: until ? (dto.reason ?? 'Закрыт') : null };
  }

  /** Карточка клиента: вся история, включая отмены и неявки. */
  /** Сбросить пароль клиенту.
   *
   *  Кода по SMS у нас нет, поэтому забытый пароль снимает менеджер: он и так
   *  разговаривает с человеком по телефону и видит, что номер совпадает.
   *  После сброса человек заводит пароль заново прямо в приложении, а все
   *  прежние входы закрываются — на случай, если аккаунт увели. */
  @Post('clients/:phone/reset-password')
  async resetClientPassword(@Req() req: any, @Param('phone') phone: string) {
    if (!this.auth.can(req.admin, 'club')) {
      throw new ForbiddenException('Нет доступа: работа с клиентами');
    }
    const key = normalizePhone(phone);
    if (!key) throw new BadRequestException('Не разобрал номер телефона');
    const c = await this.db.clients.findUnique({ where: { phone: key } });
    if (!c) throw new NotFoundException('Клиент не найден');
    await this.db.clients.update({
      where: { id: c.id }, data: { pass_hash: null, pass_at: null },
    });
    await this.db.client_sessions.deleteMany({ where: { client_id: c.id } });
    await this.auth.log(req.admin, 'сбросил пароль клиенту', `${c.name}, ${c.phone}`);
    return { ok: true };
  }

  @Get('clients/:phone')
  async client(@Param('phone') phone: string) {
    const c = await this.db.clients.findUnique({ where: { phone } });
    if (!c) throw new NotFoundException('Клиент не найден');
    const rows = await this.db.bookings.findMany({
      where: { client_id: c.id }, orderBy: { starts_at: 'desc' }, take: 50,
    });
    const courts = new Map((await this.db.courts.findMany()).map(x => [x.id, x.name]));
    return {
      id: Number(c.id), name: [c.name, c.surname].filter(Boolean).join(' '),
      phone: c.phone, whatsapp: c.whatsapp,
      cancels: c.cancels, noShows: c.no_shows, note: c.note,
      since: c.created_at,
      history: rows.map(b => ({
        id: Number(b.id), courtName: courts.get(b.court_id) ?? b.court_id,
        startsAt: b.starts_at, hours: Math.round((+b.ends_at - +b.starts_at) / 3600_000),
        price: b.price, status: b.status,
      })),
    };
  }
}

/** Целое число в заданных границах; иначе — прежнее значение. */
function int(v: unknown, fallback: number, min: number, max: number): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

/** Рубли от менеджера в копейки для базы. Дробные рубли не принимаем:
 *  цена корта — круглая сумма, а копейки в интерфейсе только путают. */
function rubToKop(rub: unknown): number {
  const n = Math.round(Number(rub));
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
    throw new BadRequestException('Цена должна быть от 0 до 1 000 000 ₽');
  }
  return n * 100;
}

/** Как назвать действие в журнале. */
const STATUS_WORD: Record<string, string> = {
  confirmed: 'подтвердил бронь',
  cancelled: 'отменил бронь',
  no_show: 'отметил неявку',
  done: 'закрыл бронь',
};

/** Требования к паролю. Слабый пароль у человека, который может отменить
 *  любую бронь, — это дыра, а не удобство. */
function checkPassword(pw: string): string {
  const p = String(pw);
  if (p.length < 8) throw new BadRequestException('Пароль не короче 8 знаков');
  if (p.length > 200) throw new BadRequestException('Пароль слишком длинный');
  if (!/[a-zA-Zа-яА-Я]/.test(p) || !/\d/.test(p)) {
    throw new BadRequestException('В пароле нужны и буквы, и цифры');
  }
  return p;
}

/** Способы оплаты. СБП отдельно от эквайринга: комиссия у них разная,
 *  и руководителю важно видеть, куда смещается доля. */
export const PAY_METHODS = ['cash', 'card', 'sbp', 'transfer', 'invoice'];
export const PAY_KINDS = ['payment', 'refund', 'penalty'];

const PAY_WORD: Record<string, string> = {
  cash: 'наличными', card: 'картой', sbp: 'по СБП',
  transfer: 'переводом', invoice: 'по счёту',
};

const KIND_WORD: Record<string, string> = {
  payment: 'принял оплату', refund: 'вернул деньги', penalty: 'удержал за неявку',
};

const EXPENSE_WORD: Record<string, string> = {
  rent: 'аренда', salary: 'зарплаты', utilities: 'коммуналка', loan: 'кредит',
  marketing: 'реклама', equipment: 'инвентарь', tax: 'налоги', other: 'прочее',
};

const SALE_WORD: Record<string, string> = {
  bar: 'бар', rental: 'прокат', coaching: 'тренировка', shop: 'товар', other: 'прочее',
};

/** Свод по статьям: {категория: сумма}. */
function groupSum(list: { category: string; amount: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of list) out[x.category] = (out[x.category] ?? 0) + x.amount;
  return out;
}

/** Ошибка PostgreSQL: бронь пересекается с существующей. */
const EXCLUSION = '23P01';
