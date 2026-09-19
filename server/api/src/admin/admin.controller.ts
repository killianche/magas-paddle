import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpException,
  NotFoundException, Param, Post, Query, Req, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AdminGuard, Needs } from './admin.guard';
import { AuthService, PERMS, type Admin, type Perm, sealPassword, openPassword, makePassword } from './auth.service';
import { clubHour, clubToday, hourOf, isValidDate, weekdayOf, shiftDate } from '../time';
import { ClubService, WEEKDAYS, hoursOn, parseWeek } from '../club';
import { accountIdOf, normalizePhone, searchDigits, bigId } from '../phone';
import { ipOf } from '../ratelimit';
import { cleanTags, colorList, colorOf } from '../courts/look';
import { randomBytes } from 'crypto';
import sharp from 'sharp';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';

/** Куда складываются загруженные фото. В контейнере это смонтированная
 *  папка сайта: nginx отдаёт её сам, без участия приложения. */
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? '/app/uploads';

/** Сколько часов после конца игры к брони ещё можно добавить продажу. */
export const SALE_WINDOW_H = 2;
/** Бронь открыта для продаж, если закончилась не раньше SALE_WINDOW_H часов
 *  назад. Будущие и идущие — можно; давно прошедшие — нет: задним числом
 *  не записываем (заказчик, 19.09.2026). */
function saleWindowOk(_starts: Date, ends: Date, now = new Date()): boolean {
  return +ends >= +now - SALE_WINDOW_H * 3600_000;
}

/** Фото из строки base64. Тип — по первым байтам файла, а не по тому, что
 *  прислал браузер: иначе под видом картинки можно положить что угодно.
 *  Разрешены JPEG, PNG и WebP до 8 МБ. */
function imageFrom(data?: string): { buf: Buffer; ext: string } {
  const raw = String(data ?? '').replace(/^data:[^;]+;base64,/, '');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length < 100) throw new BadRequestException('Файл пустой или повреждён');
  if (buf.length > 8 * 1024 * 1024) throw new BadRequestException('Фото больше 8 МБ — уменьшите его');
  const ext = buf[0] === 0xff && buf[1] === 0xd8 ? 'jpg'
    : buf.slice(0, 4).toString('hex') === '89504e47' ? 'png'
    : buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP' ? 'webp'
    : null;
  if (!ext) throw new BadRequestException('Нужна фотография в формате JPEG, PNG или WebP');
  return { buf, ext };
}

/** Сохранить фото как положено: развернуть по EXIF, уменьшить до maxSide
 *  по длинной стороне, пережать в JPEG (mozjpeg) и убрать метаданные —
 *  в EXIF телефона бывают координаты съёмки. Прозрачный фон PNG — белый.
 *  Имя файла случайное: кэш nginx не покажет старое фото под тем же адресом. */
async function saveImage(data: string | undefined, folder: string, maxSide = 2000, prefix = ''): Promise<string> {
  const { buf } = imageFrom(data);
  let out: Buffer;
  try {
    out = await sharp(buf, { failOn: 'error' })
      .rotate()
      .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new BadRequestException('Не получилось прочитать фото — сохраните его в JPEG и загрузите снова');
  }
  const name = `${prefix}${Date.now()}-${randomBytes(4).toString('hex')}.jpg`;
  const dir = join(UPLOAD_DIR, folder);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), out);
  return `/uploads/${folder}/${name}`;
}

/** Убрать загруженный файл с диска; чужие и встроенные пути не трогаем. */
async function dropUpload(url: string | null | undefined) {
  if (!url?.startsWith('/uploads/')) return;
  const rel = url.replace(/^\/uploads\//, '');
  if (!rel.includes('..')) await unlink(join(UPLOAD_DIR, rel)).catch(() => {});
}
import { NotificationsService } from '../notifications/notifications.service';

class StatusDto {
  @IsIn(['confirmed', 'cancelled', 'no_show', 'done'])
  status: 'confirmed' | 'cancelled' | 'no_show' | 'done';
  /** Отмена: по просьбе клиента или по инициативе клуба — от этого зависят
   *  текст уведомления и счётчик отмен у клиента. */
  @IsOptional() @IsIn(['client', 'club'])
  by?: 'client' | 'club';
  /** Внесённые деньги при отмене или неявке: вернуть клиенту или оставить
   *  клубу. Не передали — по правилу клуба (см. keptByRule). */
  //   refund — вернуть сейчас (запишется возврат), keep — оставить клубу,
  //   later — вернуть позже: деньги числятся долгом клуба перед клиентом
  @IsOptional() @IsIn(['refund', 'keep', 'later'])
  money?: 'refund' | 'keep' | 'later';
  /** Как вернули деньги: наличными, картой, по СБП, переводом. */
  @IsOptional() @IsString() @MaxLength(20)
  refundMethod?: string;
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
    const ip = ipOf(req);
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
    private readonly notes: NotificationsService,
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
      // Сам пароль не отдаём списком — только по отдельному запросу владельца
      hasSealed: !!r.password_enc,
    }));
  }

  /** Пароль сотрудника — только владельцу, каждый просмотр — в журнал. */
  @Get('staff/:id/password')
  async staffPassword(@Req() req: any, @Param('id') id: string) {
    const me: Admin = req.admin;
    if (me.role !== 'owner') throw new ForbiddenException('Пароли видит только владелец');
    const row = await this.db.admins.findUnique({ where: { id: bigId(id) } });
    if (!row) throw new NotFoundException('Сотрудник не найден');
    const password = openPassword(row.password_enc);
    await this.auth.log(me, 'посмотрел пароль', `${row.name} (${row.login})`);
    return { password };
  }

  /** Новый пароль сотруднику. Не передали — придумаем сами. Входы с прежним
   *  паролем закрываются. Пароль владельца меняет только владелец. */
  @Post('staff/:id/password')
  @Needs('staff')
  async setStaffPassword(@Req() req: any, @Param('id') id: string, @Body() body: { password?: string }) {
    const me: Admin = req.admin;
    const row = await this.db.admins.findUnique({ where: { id: bigId(id) } });
    if (!row) throw new NotFoundException('Сотрудник не найден');
    if (row.role === 'owner' && me.role !== 'owner') throw new ForbiddenException('Пароль владельца меняет только владелец');
    const password = checkPassword(body.password ? String(body.password) : makePassword());
    await this.db.admins.update({ where: { id: row.id }, data: {
      password_hash: await this.auth.hash(password), password_enc: sealPassword(password) } });
    await this.auth.dropSessions(Number(row.id));
    await this.auth.log(me, 'сменил пароль сотрудника', `${row.name} (${row.login})`);
    // Владелец видит новый пароль сразу; сотрудник с правом «сотрудники» — тоже,
    // один раз: он его и выдаёт
    return { password };
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
      if (body.password) {
        data.password_hash = await this.auth.hash(checkPassword(body.password));
        data.password_enc = sealPassword(body.password);
      }

      // Имя и пароль владельца меняет только сам владелец: иначе сотрудник
      // с правом «сотрудники» поставил бы ему свой пароль и вошёл владельцем
      if (row.role === 'owner' && me.role !== 'owner') {
        throw new ForbiddenException('Данные владельца может менять только владелец');
      }
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

    // Пароль не задали — придумываем сами и сразу показываем
    const password = checkPassword(body.password ? String(body.password) : makePassword());
    const created = await this.db.admins.create({ data: {
      login, name, role: 'staff', perms,
      password_hash: await this.auth.hash(password), password_enc: sealPassword(password),
    }});
    await this.auth.log(me, 'завёл сотрудника', `${name} (${login})`);
    return { id: Number(created.id), password };
  }

  @Post('staff/:id/delete')
  @Needs('staff')
  async deleteStaff(@Req() req: any, @Param('id') id: string) {
    const row = await this.db.admins.findUnique({ where: { id: bigId(id) } });
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
    const extrasBy = await this.extrasOf(rows.map(r => r.id));
    // Продажи клиентам без брони за этот день — это тоже деньги дня
    const direct = await this.db.sales.aggregate({
      where: { day: new Date(d), method: { not: 'bill' } }, _sum: { amount: true }, _count: { _all: true } });

    // Часы этого дня недели. Сетку растягиваем на уже существующие брони:
    // если день сократили или сделали выходным, записи не должны пропасть
    // с экрана менеджера.
    const dh = hoursOn(set, d);
    const alive = rows.filter(b => b.status !== 'cancelled' && b.status !== 'expired');
    let gridOpen = dh.closed ? 24 : dh.open;
    let gridClose = dh.closed ? 0 : dh.close;
    for (const b of alive) {
      gridOpen = Math.min(gridOpen, hourOf(b.starts_at));
      const end = hourOf(b.ends_at) === 0 ? 24 : hourOf(b.ends_at);
      gridClose = Math.max(gridClose, end);
    }
    if (gridOpen >= gridClose) { gridOpen = 0; gridClose = 0 }

    return {
      date: d,
      directSales: { sum: direct._sum.amount ?? 0, count: direct._count._all },
      openHour: gridOpen,
      closeHour: gridClose,
      /** Рабочие часы клуба в этот день; вне их запись закрыта. */
      workOpen: dh.closed ? 0 : dh.open,
      workClose: dh.closed ? 0 : dh.close,
      dayOff: dh.closed,
      courts: courts.map(c => ({
        id: c.id, name: c.name, isActive: c.is_active,
        closedUntil: c.closed_until, closedReason: c.closed_reason,
        // Цвет покрытия — в сетке дня столбец корта выделен своим цветом
        color: colorOf(c.color), isFootball: c.is_football, tags: c.tags,
      })),
      bookings: rows.map(b => {
        const cl = b.client_id ? byId.get(String(b.client_id)) : null;
        return {
          id: Number(b.id), courtId: b.court_id,
          hour: hourOf(b.starts_at),
          hours: Math.round((+b.ends_at - +b.starts_at) / 3600_000),
          price: b.price, status: b.status, source: b.source,
          // Корт под турниром: в карточке только ссылка на турнир
          tournamentId: b.tournament_id ? Number(b.tournament_id) : null,
          comment: b.comment, createdAt: b.created_at,
          guestName: b.guest_name,
          paid: paidBy.get(String(b.id)) ?? 0,
          statusAt: b.status_at, statusBy: b.status_by,
          holdUntil: b.hold_until,
          // Отменённая или неявочная бронь: предоплата остаётся клубу или ждёт возврата
          keptPrepay: b.kept_prepay,
          // Можно ли сейчас добавить к брони продажу (окно SALE_WINDOW_H)
          saleOpen: !b.tournament_id && ['pending', 'confirmed', 'done'].includes(b.status)
            && saleWindowOk(b.starts_at, b.ends_at),
          players: b.players, discount: b.discount, discountReason: b.discount_reason,
          createdBy: b.created_by,
          // Строки счёта брони: прокат, мячи — оплачиваются вместе с кортом
          extras: extrasBy.get(String(b.id)) ?? { sum: 0, items: [] },
          client: cl ? {
            id: Number(cl.id), name: [cl.name, cl.surname].filter(Boolean).join(' '),
            phone: cl.phone, whatsapp: cl.whatsapp,
            cancels: cl.cancels, noShows: cl.no_shows, note: cl.note,
          } : null,
        };
      }),
    };
  }

  /** Продажи, прикреплённые к броням: сумма и строки по каждой. */
  private async extrasOf(ids: bigint[]) {
    const out = new Map<string, { sum: number; items: { id: number; item: string; qty: number; amount: number }[] }>();
    if (!ids.length) return out;
    const rows = await this.db.sales.findMany({
      where: { booking_id: { in: ids } }, orderBy: { id: 'asc' } });
    for (const r of rows) {
      const k = String(r.booking_id);
      const cur = out.get(k) ?? { sum: 0, items: [] };
      cur.sum += r.amount;
      cur.items.push({ id: Number(r.id), item: r.item ?? SALE_WORD[r.category] ?? r.category,
        qty: r.qty, amount: r.amount });
      out.set(k, cur);
    }
    return out;
  }

  /** Подтвердить, отменить или отметить, что не пришёл. */
  @Post('bookings/:id/status')
  async setStatus(@Req() req: any, @Param('id') id: string, @Body() dto: StatusDto) {
    const b = await this.db.bookings.findUnique({ where: { id: bigId(id) } });
    if (!b) throw new NotFoundException('Запись не найдена');
    // Два менеджера нажали одно и то же — второй раз ничего не делаем
    if (b.status === dto.status) return { id: Number(b.id), status: dto.status };

    // Что можно менять задним числом, а что нет. Раньше сгоревшую заявку
    // прошлой недели можно было «подтвердить», а отыгранную — «отменить».
    const now = new Date();
    const ended = b.ends_at <= now, begun = b.starts_at <= now;
    if (dto.status === 'cancelled' && ended) {
      throw new ConflictException('Игра уже прошла. Отметьте «отыграна» или «не пришёл»');
    }
    if (dto.status === 'confirmed' && ended) {
      throw new ConflictException('Время уже прошло — подтвердить нельзя');
    }
    if ((dto.status === 'no_show' || dto.status === 'done') && !begun) {
      throw new ConflictException('Игра ещё не началась');
    }
    if ((dto.status === 'no_show' || dto.status === 'done') && !['confirmed', 'no_show', 'done'].includes(b.status)) {
      throw new ConflictException('Так отмечают только подтверждённую бронь');
    }
    if (b.tournament_id) throw new ConflictException('Это корт под турниром — управляйте им в разделе «Турниры»');
    const set = await this.club.get();
    // Отмена позже, чем разрешает клуб: предоплата сгорает (правило D13)
    const late = dto.status === 'cancelled' && +b.starts_at - Date.now() < set.cancelHours * 3600_000;
    const byClient = dto.status === 'cancelled' && dto.by === 'client';

    // Отмена и неявка бьют по клиенту и по выручке — отдельное право
    if ((dto.status === 'cancelled' || dto.status === 'no_show')
        && !this.auth.can(req.admin, 'cancel')) {
      throw new ForbiddenException('Нет доступа: отменять брони и отмечать неявку');
    }

    // Судьба внесённой предоплаты (решение заказчика 19.09.2026, D27).
    // Штрафов нет: клуб просто не возвращает то, что человек уже внёс.
    //   не пришёл                       → остаётся клубу
    //   отмена клиентом позже срока     → остаётся клубу (правило D13)
    //   отмена клубом или вовремя       → возвращаем
    //   бронь снова живая               → возвращаем к обычному расчёту
    const byRule = dto.status === 'no_show' ? true
      : dto.status === 'cancelled' ? (byClient && late)
      : false;
    // Менеджер может решить иначе: вернуть деньги неявившемуся или оставить
    // клубу предоплату при отмене. Это бывает редко, но должно быть можно.
    const closing = dto.status === 'cancelled' || dto.status === 'no_show';
    const paidBefore = closing ? await this.paidOf(b.id) : 0;
    const refundNow = closing && paidBefore > 0 && dto.money === 'refund';
    if (refundNow && !this.auth.can(req.admin, 'refunds')) {
      throw new ForbiddenException('Нет доступа: возвращать деньги');
    }
    const refundMethod = String(dto.refundMethod ?? 'cash');
    if (refundNow && !PAY_METHODS.includes(refundMethod)) {
      throw new BadRequestException('Такого способа возврата нет');
    }
    const kept = !closing ? false
      : refundNow ? false
      : dto.money === 'keep' ? paidBefore > 0
      : dto.money === 'later' ? false
      : byRule;

    const ops: any[] = [
      this.db.bookings.update({ where: { id: b.id }, data: {
        status: dto.status, status_at: new Date(),
        status_by: byClient ? `client via ${req.admin.login}${late ? ', поздняя отмена' : ''}` : req.admin.login,
        kept_prepay: kept,
        // Подтвердили — место больше не «на удержании», срок снимаем
        hold_until: dto.status === 'confirmed' ? null : b.hold_until,
      }}),
    ];
    // Отменённая бронь и неявка не тянут за собой строки счёта: человек не
    // играл — ракетку и мячи не брал. Товар из этих строк возвращается на
    // склад — с записью в журнале движений.
    if (dto.status === 'cancelled' || dto.status === 'no_show') {
      const lines = await this.db.sales.findMany({
        where: { booking_id: b.id, method: 'bill', product_id: { not: null } }, include: { products: true } });
      const back = new Map<string, number>();
      for (const l of lines) {
        const pr = l.products;
        if (!pr || pr.category === 'rental' || pr.stock == null) continue;
        const after = (back.get(String(pr.id)) ?? pr.stock) + l.qty;
        back.set(String(pr.id), after);
        ops.push(this.db.products.update({ where: { id: pr.id }, data: { stock: { increment: l.qty } } }));
        ops.push(this.db.stock_moves.create({ data: {
          product_id: pr.id, kind: 'return', qty: l.qty, stock_after: after,
          note: `бронь №${Number(b.id)} ${dto.status === 'no_show' ? '— не пришёл' : 'отменена'}`, admin_id: BigInt(req.admin.id), admin_name: req.admin.name,
        }}));
      }
      ops.push(this.db.sales.deleteMany({ where: { booking_id: b.id, method: 'bill' } }));
    }
    // Возврат — отдельной строкой в платежах, минусом: видно, кто и когда вернул
    if (refundNow) {
      ops.push(this.db.payments.create({ data: {
        booking_id: b.id, amount: -paidBefore, method: refundMethod, kind: 'refund',
        note: dto.status === 'no_show' ? 'возврат при неявке' : 'возврат при отмене',
        admin_id: BigInt(req.admin.id), admin_name: req.admin.name,
      }}));
    }
    // История поведения клиента: менеджер должен видеть, кто часто пропадает.
    // Считаем только то, что на совести клиента: неявку и отмену подтверждённой
    // брони по его просьбе. Отказ клуба по заявке — не его отмена.
    if (b.client_id) {
      if (dto.status === 'no_show' && b.status !== 'no_show') {
        ops.push(this.db.clients.update({
          where: { id: b.client_id }, data: { no_shows: { increment: 1 } } }));
      }
      if (b.status === 'no_show' && dto.status !== 'no_show') {
        ops.push(this.db.clients.updateMany({
          where: { id: b.client_id, no_shows: { gt: 0 } }, data: { no_shows: { decrement: 1 } } }));
      }
      if (dto.status === 'cancelled' && byClient && b.status === 'confirmed') {
        ops.push(this.db.clients.update({
          where: { id: b.client_id }, data: { cancels: { increment: 1 } } }));
      }
      if (b.status === 'cancelled' && dto.status === 'confirmed' && (b.status_by ?? '').startsWith('client')) {
        ops.push(this.db.clients.updateMany({
          where: { id: b.client_id, cancels: { gt: 0 } }, data: { cancels: { decrement: 1 } } }));
      }
    }
    try {
      await this.db.$transaction(ops);
    } catch (e) {
      // Сгоревшую или отменённую заявку вернули, а время уже занял другой
      if (/23P01|no_double_booking/.test(String((e as any)?.message ?? e))) {
        throw new ConflictException('Это время уже занято другой бронью — подтвердить нельзя');
      }
      throw e;
    }

    // Человек должен узнать о судьбе своей заявки, не заглядывая в приложение
    // каждые полчаса. Уведомление кладём в его ящик; когда подключат пуши,
    // отсюда же уйдёт и push.
    if (b.client_id && b.status !== dto.status) {
      const court = await this.db.courts.findUnique({ where: { id: b.court_id } });
      const when = whenText(b.starts_at, b.ends_at);
      const where = court?.name ?? b.court_id;
      const rubs = (k: number) => `${(k / 100).toLocaleString('ru-RU')} ₽`;
      // Что стало с деньгами — одной фразой, без сюрпризов для клиента
      const moneyLine = !closing || paidBefore <= 0 ? ''
        : refundNow ? ` Внесённые ${rubs(paidBefore)} возвращены.`
        : kept
          ? (dto.status === 'cancelled' && late
              ? ` Отмена позже чем за ${set.cancelHours} ч — предоплата ${rubs(paidBefore)} не возвращается.`
              : ` Предоплата ${rubs(paidBefore)} не возвращается.`)
          : ` Внесённые ${rubs(paidBefore)} вернём — напишите менеджеру, как удобнее.`;
      const text: Record<string, [string, string]> = {
        confirmed: ['Бронь подтверждена',
          `${where}, ${when}. Ждём вас — до встречи на корте.`],
        cancelled: byClient
          ? ['Запись отменена по вашей просьбе', `${where}, ${when}.${moneyLine}`]
          : ['Бронь отменена клубом',
             `${where}, ${when}. Время снова свободно.${moneyLine} Если это ошибка, напишите менеджеру.`],
        no_show: ['Отмечено, что вы не пришли',
          `${where}, ${when}.${moneyLine} Если это ошибка, скажите менеджеру — поправим.`],
        done: ['Спасибо за игру',
          `${where}, ${when}. Будем рады видеть вас снова.`],
      };
      const t = text[dto.status];
      if (t) {
        await this.notes.toClient(b.client_id, 'booking', t[0], t[1],
          { bookingId: b.id, by: req.admin.name });
      }
    }

    await this.auth.log(req.admin, STATUS_WORD[dto.status] ?? dto.status,
      `бронь №${Number(b.id)}${byClient ? ', по просьбе клиента' : ''}${late ? ', поздняя отмена' : ''}`
      + (refundNow ? `, возвращено ${(paidBefore / 100).toLocaleString('ru-RU')} ₽`
        : kept && paidBefore > 0 ? `, предоплата ${(paidBefore / 100).toLocaleString('ru-RU')} ₽ осталась клубу` : ''));
    const paid = closing ? await this.paidOf(b.id) : 0;
    return { id: Number(b.id), status: dto.status, late, paid, kept, refunded: refundNow ? paidBefore : 0,
             cancelHours: set.cancelHours };
  }

  /** Скидка постоянному или по договорённости. Цена по прайсу остаётся —
   *  иначе потом не понять, почему сумма не сошлась. */
  @Post('bookings/:id/discount')
  @Needs('prices')
  async discount(@Req() req: any, @Param('id') id: string, @Body() body: {
    amount?: number; reason?: string;
  }) {
    const b = await this.db.bookings.findUnique({ where: { id: bigId(id) } });
    if (!b) throw new NotFoundException('Запись не найдена');
    if (b.tournament_id) throw new ConflictException('Это корт под турниром');
    if (!['pending', 'confirmed', 'done'].includes(b.status)) throw new ConflictException('Бронь отменена — скидка не нужна');
    if (Number(body.amount ?? 0) < 0) throw new BadRequestException('Скидка не бывает отрицательной');
    const amount = rubToKop(Math.max(0, Number(body.amount ?? 0)));
    if (amount > b.price) throw new BadRequestException('Скидка больше цены');
    const paidSoFar = await this.paidOf(b.id);
    if (b.price - amount < paidSoFar) {
      throw new BadRequestException(`Уже внесено ${(paidSoFar / 100).toLocaleString('ru-RU')} ₽ — такая скидка сделает переплату. Сначала оформите возврат`);
    }
    const reason = body.reason ? String(body.reason).trim().slice(0, 200) : null;
    if (amount > 0 && !reason) throw new BadRequestException('Напишите причину скидки');

    await this.db.bookings.update({ where: { id: b.id }, data: {
      discount: amount, discount_reason: amount > 0 ? reason : null,
    }});
    if (b.client_id && amount !== b.discount && ['pending', 'confirmed'].includes(b.status)) {
      await this.notes.toClient(b.client_id, 'booking',
        amount > 0 ? `Скидка ${(amount / 100).toLocaleString('ru-RU')} ₽` : 'Скидка снята',
        amount > 0 ? `Клуб дал скидку на бронь ${whenText(b.starts_at, b.ends_at)}: к оплате ${((b.price - amount) / 100).toLocaleString('ru-RU')} ₽.`
                   : `Скидка на бронь ${whenText(b.starts_at, b.ends_at)} снята.`,
        { bookingId: b.id, by: req.admin.name });
    }
    await this.auth.log(req.admin, amount > 0 ? 'дал скидку' : 'убрал скидку',
      `бронь №${Number(b.id)}, ${(amount / 100).toLocaleString('ru-RU')} ₽${reason ? ', ' + reason : ''}`);
    return { ok: true };
  }

  /** Сколько человек играло. Падел — четверо, футбол — десять;
   *  без этого нет ни трафика, ни выручки на человека. */
  @Post('bookings/:id/players')
  async setPlayers(@Req() req: any, @Param('id') id: string, @Body() body: { players?: number }) {
    const b = await this.db.bookings.findUnique({ where: { id: bigId(id) } });
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
      where: { booking_id: bigId(id) }, orderBy: { created_at: 'asc' },
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
    const b = await this.db.bookings.findUnique({ where: { id: bigId(id) } });
    if (!b) throw new NotFoundException('Запись не найдена');
    if (b.tournament_id) throw new ConflictException('Это корт под турниром — деньги за него не принимают');

    const method = String(body.method ?? 'cash');
    if (!PAY_METHODS.includes(method)) throw new BadRequestException('Такого способа оплаты нет');
    const kind = String(body.kind ?? 'payment');
    if (!PAY_KINDS.includes(kind)) throw new BadRequestException('Неизвестный вид платежа');
    // По отменённой или сгоревшей брони деньги можно только вернуть
    if (['cancelled', 'expired'].includes(b.status) && kind !== 'refund') {
      throw new ConflictException('Бронь отменена — по ней можно только вернуть деньги');
    }
    let amount = rubToKop(Math.abs(Number(body.amount ?? 0)));
    if (amount === 0) throw new BadRequestException('Сумма не может быть нулевой');
    // Возврат хранится минусом: так остаётся след, кто и когда вернул деньги
    if (kind === 'refund') {
      if (!this.auth.can(req.admin, 'refunds')) throw new ForbiddenException('Нет доступа: возвращать деньги');
      amount = -amount;
    }

    const paid = await this.paidOf(b.id);
    const extras = (await this.extrasOf([b.id])).get(String(b.id))?.sum ?? 0;
    if (kind !== 'refund' && paid + amount > (b.price + extras) * 3) {
      throw new BadRequestException('Сумма сильно больше цены — похоже на ошибку');
    }
    if (kind === 'refund' && paid + amount < 0) {
      throw new BadRequestException('Вернуть больше, чем получено, нельзя');
    }

    // Деньги приняты — заявка считается подтверждённой: раньше оплаченная
    // заявка сгорала через час, если менеджер не нажал ещё и «Подтвердить»
    const confirmNow = kind === 'payment' && b.status === 'pending';
    await this.db.$transaction([
      this.db.payments.create({ data: {
        booking_id: b.id, amount, method, kind,
        receipt: body.receipt ? String(body.receipt).trim().slice(0, 40) : null,
        note: body.note ? String(body.note).trim().slice(0, 200) : null,
        admin_id: BigInt(req.admin.id), admin_name: req.admin.name,
      }}),
      ...(confirmNow ? [this.db.bookings.update({ where: { id: b.id }, data: {
        status: 'confirmed', status_at: new Date(), status_by: req.admin.login, hold_until: null } })] : []),
      // Вернули всё — удерживать больше нечего
      ...(kind === 'refund' && paid + amount === 0 && b.kept_prepay
        ? [this.db.bookings.update({ where: { id: b.id }, data: { kept_prepay: false } })] : []),
    ]);
    await this.auth.log(req.admin, KIND_WORD[kind],
      `бронь №${Number(b.id)}, ${(Math.abs(amount) / 100).toLocaleString('ru-RU')} ₽, ${PAY_WORD[method]}${confirmNow ? ', бронь подтверждена' : ''}`);
    if (b.client_id) {
      const when = whenText(b.starts_at, b.ends_at);
      const sum = (Math.abs(amount) / 100).toLocaleString('ru-RU');
      const [title, text] = kind === 'refund'
        ? ['Деньги возвращены', `Возврат ${sum} ₽ по брони ${when}.`]
        : confirmNow
          ? ['Оплата принята, бронь подтверждена', `${sum} ₽ получено. ${when} — ждём вас на корте.`]
          : ['Оплата принята', `${sum} ₽ получено по брони ${when}.`];
      await this.notes.toClient(b.client_id, 'booking', title, text, { bookingId: b.id, by: req.admin.name });
    }
    return { ok: true, paid: paid + amount, price: b.price, confirmed: confirmNow };
  }

  /** Судьба предоплаты по несостоявшейся брони: остаётся клубу или возвращается.
   *  Денег это не двигает — меняется только то, чем считать уже внесённое. */
  @Post('bookings/:id/keep')
  @Needs('cancel')
  async keepPrepay(@Req() req: any, @Param('id') id: string, @Body() body: { keep?: boolean }) {
    const b = await this.db.bookings.findUnique({ where: { id: bigId(id) } });
    if (!b) throw new NotFoundException('Запись не найдена');
    if (!['cancelled', 'expired', 'no_show'].includes(b.status)) {
      throw new ConflictException('Так решают только по отменённой брони или неявке');
    }
    const keep = body.keep !== false;
    const paid = await this.paidOf(b.id);
    if (keep && paid <= 0) throw new ConflictException('По этой брони денег не внесено');
    await this.db.bookings.update({ where: { id: b.id }, data: { kept_prepay: keep } });
    await this.auth.log(req.admin, keep ? 'оставил предоплату клубу' : 'снял удержание предоплаты',
      `бронь №${Number(b.id)}, ${(paid / 100).toLocaleString('ru-RU')} ₽`);
    return { ok: true, keptPrepay: keep, paid };
  }

  /** Убрать ошибочный платёж. Это исправление, а не рядовое действие. */
  @Post('payments/:id/delete')
  @Needs('cancel')
  async deletePayment(@Req() req: any, @Param('id') id: string) {
    const row = await this.db.payments.findUnique({ where: { id: bigId(id) } });
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

    const digits = searchDigits(text);
    // «ID 12» — аккаунт из сообщения WhatsApp: все брони этого человека
    const accountId = accountIdOf(text);
    const clients = await this.db.clients.findMany({
      where: accountId != null ? { id: accountId } : {
        OR: [
          { name: { contains: text, mode: 'insensitive' } },
          ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
        ],
      },
      take: 40,
    });

    // «65» или «№65» — это номер заявки из сообщения WhatsApp: менеджер
    // вбивает его в поиск и сразу видит, чья бронь
    const asNumber = accountId == null && /^\D*\d{1,9}\D*$/.test(text) ? BigInt(digits) : null;
    const rows = await this.db.bookings.findMany({
      where: {
        OR: [
          ...(clients.length ? [{ client_id: { in: clients.map(c => c.id) } }] : []),
          ...(accountId == null ? [{ guest_name: { contains: text, mode: 'insensitive' as const } }] : []),
          ...(asNumber != null ? [{ id: asNumber }] : []),
        ],
      },
      orderBy: { starts_at: 'desc' },
      take: 60,
    });

    const courts = await this.db.courts.findMany();
    const courtName = new Map(courts.map(c => [c.id, c.name]));
    const extra = await this.db.clients.findMany({ where: { id: {
      in: rows.map(r => r.client_id).filter((x): x is bigint => x != null
        && !clients.some(c => c.id === x)) } } });
    const byId = new Map([...clients, ...extra].map(c => [String(c.id), c]));

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

  /** Быстрый поиск клиента — для верхней строки поиска и окна «Записать
   *  клиента». Сначала люди (имя, фамилия, любые цифры номера, «ID 12»),
   *  потом брони по номеру заявки. Без отдельного права: это работа стойки. */
  @Get('find')
  async find(@Query('q') q?: string) {
    const text = String(q ?? '').trim().slice(0, 60);
    if (!text) return { clients: [], bookings: [] };
    const digits = text.replace(/\D/g, '');
    const letters = text.replace(/[\d\s()+\-#№]/g, '');
    const accountId = accountIdOf(text);
    // Номер ищем по «голым» цифрам. 8 в начале полного номера — это 7.
    const phoneDigits = digits.length === 11 && digits.startsWith('8') ? '7' + digits.slice(1) : digits;
    const words = letters ? text.split(/\s+/).filter(w => /\D/.test(w)) : [];
    const where: any = accountId != null ? { id: accountId } : { OR: [
      ...words.map(w => ({ name: { contains: w, mode: 'insensitive' } })),
      ...words.map(w => ({ surname: { contains: w, mode: 'insensitive' } })),
      ...(phoneDigits.length >= 2 ? [{ phone: { contains: phoneDigits } }, { whatsapp: { contains: phoneDigits } }] : []),
    ] };
    if (!where.OR?.length && accountId == null) return { clients: [], bookings: [] };
    const found = await this.db.clients.findMany({ where, take: 200 });

    // Порядок: полное совпадение номера, потом номер кончается на эти цифры,
    // потом имя начинается с текста, потом остальные — и внутри по свежести
    const lower = letters.toLowerCase();
    const rank = (c: typeof found[number]) =>
      phoneDigits.length >= 2 && c.phone === phoneDigits ? 0
      : phoneDigits.length >= 2 && c.phone.endsWith(phoneDigits) ? 1
      : lower && (c.name ?? '').toLowerCase().startsWith(lower) ? 2 : 3;
    const ids = found.map(c => c.id);
    const stats = ids.length ? await this.db.bookings.groupBy({
      by: ['client_id'], where: { client_id: { in: ids }, status: { in: ['confirmed', 'done'] } },
      _count: { _all: true }, _max: { starts_at: true },
    }) : [];
    const st = new Map(stats.map(x => [String(x.client_id), x]));
    const clients = found
      .map(c => ({ c, r: rank(c), last: st.get(String(c.id))?._max.starts_at ?? null }))
      .sort((a, b) => a.r - b.r || (+(b.last ?? 0) - +(a.last ?? 0)))
      .slice(0, 12)
      .map(({ c, last }) => ({
        id: Number(c.id), name: [c.name, c.surname].filter(Boolean).join(' '), phone: c.phone,
        hasPassword: !!c.pass_hash, games: st.get(String(c.id))?._count._all ?? 0, lastAt: last,
      }));

    // «№96» или «96» — номер заявки из WhatsApp
    const asNumber = accountId == null && /^\D*\d{1,9}\D*$/.test(text) && digits.length <= 6 ? BigInt(digits) : null;
    const bookings = asNumber != null ? await this.db.bookings.findMany({
      where: { id: asNumber }, include: { clients: true, courts: true } }) : [];
    return {
      clients,
      bookings: bookings.map(b => ({
        id: Number(b.id), date: this.dateOf(b.starts_at), hour: hourOf(b.starts_at),
        hours: Math.round((+b.ends_at - +b.starts_at) / 3600_000), status: b.status,
        courtName: b.courts?.name ?? b.court_id,
        name: [b.clients?.name, b.clients?.surname].filter(Boolean).join(' ') || b.guest_name || 'Без имени',
        phone: b.clients?.phone ?? null,
      })),
    };
  }

  /** Заявки, ждущие подтверждения, по всем датам сразу.
   *  Раньше счётчик считал только открытый день, и заявка на будущую дату
   *  висела неподтверждённой, пока кто-то случайно не откроет тот день. */
  @Get('pending')
  async pending() {
    await this.club.releaseExpired();
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

    const list: any[] = rows.map(b => {
      const cl = b.client_id ? byId.get(String(b.client_id)) : null;
      return {
        kind: 'booking',
        id: Number(b.id), courtId: b.court_id, courtName: courtName.get(b.court_id) ?? b.court_id,
        date: this.dateOf(b.starts_at), hour: hourOf(b.starts_at),
        hours: Math.round((+b.ends_at - +b.starts_at) / 3600_000),
        price: b.price, createdAt: b.created_at,
        name: cl?.name ?? b.guest_name ?? 'Без имени',
        phone: cl?.phone ?? null,
      };
    });

    // Заявки на турниры ждут подтверждения так же, как брони
    const entries = await this.db.tournament_entries.findMany({
      where: { status: 'pending', tournaments: { starts_at: { gte: new Date() } } },
      include: { tournaments: true, clients: true }, orderBy: { created_at: 'asc' }, take: 100,
    });
    for (const e of entries) list.push({
      kind: 'tournament', id: Number(e.id), tournamentId: Number(e.tournament_id),
      courtName: `турнир «${e.tournaments.name}»`,
      date: this.dateOf(e.tournaments.starts_at), hour: hourOf(e.tournaments.starts_at),
      hours: e.tournaments.hours, price: e.tournaments.fee, createdAt: e.created_at,
      name: [e.clients.name, e.clients.surname].filter(Boolean).join(' '), phone: e.clients.phone,
    });
    return list.sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour);
  }

  /** Перенести бронь на другой корт или час.
   *  Отдельная операция, а не «отменить и создать заново»: при обходе
   *  клиент оставался без корта, если новое время оказывалось занято,
   *  и получал отмену в свою карточку ни за что. */
  @Post('bookings/:id/move')
  async move(@Req() req: any, @Param('id') id: string, @Body() body: {
    courtId: string; date: string; hour: number; hours?: number;
  }) {
    const b = await this.db.bookings.findUnique({ where: { id: bigId(id) } });
    if (!b) throw new NotFoundException('Запись не найдена');
    if (b.tournament_id) throw new ConflictException('Это корт под турниром — время меняют в самом турнире');
    if (!isValidDate(body.date)) throw new BadRequestException('Дата в виде ГГГГ-ММ-ДД');
    if (!['pending', 'confirmed'].includes(b.status)) {
      throw new ConflictException('Переносят только ждущую или подтверждённую бронь');
    }
    if (b.ends_at <= new Date()) throw new ConflictException('Игра уже прошла — переносить нечего');
    const target = clubHour(body.date, Number(body.hour));
    if (target < new Date()) throw new BadRequestException('Нельзя перенести на прошедшее время');

    const court = await this.db.courts.findUnique({ where: { id: body.courtId } });
    if (!court || !court.is_active) throw new NotFoundException('Площадка не найдена');
    if (court.closed_until && court.closed_until > target) {
      throw new BadRequestException(court.closed_reason ?? 'Площадка закрыта');
    }

    const pricing = await this.club.pricing();
    const set = pricing.settings;
    const hoursCount = Math.trunc(
      body.hours ?? Math.round((+b.ends_at - +b.starts_at) / 3600_000));
    if (hoursCount > set.maxHours) throw new BadRequestException(`Больше ${set.maxHours} часов подряд занять нельзя`);
    const dh = hoursOn(set, body.date);
    if (dh.closed) throw new BadRequestException('В этот день клуб не работает — часы меняются в настройках');
    if (body.hour < dh.open || hoursCount < 1 || body.hour + hoursCount > dh.close) {
      throw new BadRequestException('Время не помещается в рабочий день');
    }

    const price = pricing.span(court, weekdayOf(body.date), body.hour, hoursCount);

    try {
      // Одна операция обновления: старое место освобождается только вместе
      // с занятием нового, промежуточного состояния «нигде» не бывает.
      const startsAt = clubHour(body.date, body.hour);
      await this.db.bookings.update({ where: { id: b.id }, data: {
        court_id: court.id,
        starts_at: startsAt,
        ends_at: clubHour(body.date, body.hour + hoursCount),
        price,
        // Скидка не может быть больше новой цены
        discount: Math.min(b.discount, price),
        // Заявка ждёт подтверждения — срок держим, но не дольше начала игры
        hold_until: b.status === 'pending' && b.hold_until
          ? new Date(Math.min(+b.hold_until, +startsAt)) : b.hold_until,
      }});
      const oldCourt = await this.db.courts.findUnique({ where: { id: b.court_id } });
      await this.auth.log(req.admin, 'перенёс бронь',
        `№${Number(b.id)}: ${oldCourt?.name ?? b.court_id} ${whenText(b.starts_at, b.ends_at)} → ${court.name} ${whenText(startsAt, clubHour(body.date, body.hour + hoursCount))}`);
      if (b.client_id) {
        await this.notes.toClient(b.client_id, 'booking', 'Бронь перенесена',
          `Было: ${oldCourt?.name ?? b.court_id}, ${whenText(b.starts_at, b.ends_at)}. Стало: ${court.name}, ${whenText(startsAt, clubHour(body.date, body.hour + hoursCount))}.${
            price !== b.price ? ` К оплате теперь ${((price - Math.min(b.discount, price)) / 100).toLocaleString('ru-RU')} ₽.` : ''}`,
          { bookingId: b.id, by: req.admin.name });
      }
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
  @Needs('analytics')
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
    if (q.paid === 'yes') where.payments = { some: { kind: 'payment' } };
    if (q.paid === 'no') where.payments = { none: { kind: 'payment' } };
    if (q.source === 'app' || q.source === 'admin') where.source = q.source;

    const text = (q.search ?? '').trim();
    if (text.length >= 2) {
      const digits = searchDigits(text);
      const accountId = accountIdOf(text);
      const clients = await this.db.clients.findMany({
        where: accountId != null ? { id: accountId } : { OR: [
          { name: { contains: text, mode: 'insensitive' } },
          ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
        ]},
        select: { id: true },
      });
      where.OR = accountId != null
        ? [{ client_id: { in: clients.map(c => c.id) } }]
        : [
            ...(clients.length ? [{ client_id: { in: clients.map(c => c.id) } }] : []),
            { guest_name: { contains: text, mode: 'insensitive' as const } },
          ];
    }

    const take = Math.min(500, Math.max(1, Number(q.limit) || 100));
    const skip = Math.max(0, Number(q.offset) || 0);

    const [rows, total, charged, received] = await Promise.all([
      this.db.bookings.findMany({ where, orderBy: { starts_at: 'desc' }, take, skip }),
      this.db.bookings.count({ where }),
      // Итоги по всему периоду, а не по показанной странице; скидки вычтены.
      // Только состоявшиеся брони: сгоревшие и отменённые заявки — не долги
      this.db.bookings.aggregate({ where: { ...where, status: { in: ['confirmed', 'done'] } },
        _sum: { price: true, discount: true } }),
      this.db.payments.aggregate({
        where: { bookings: { ...where, status: { in: ['confirmed', 'done'] } } }, _sum: { amount: true },
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
    const extrasBy = await this.extrasOf(rows.map(r => r.id));
    // Доп. позиции всего периода — в «начислено», иначе долги сходятся неверно
    const extrasAll = await this.db.sales.aggregate({
      where: { bookings: { ...where, status: { in: ['confirmed', 'done'] } } }, _sum: { amount: true } });

    return {
      total, from, to,
      charged: (charged._sum.price ?? 0) - (charged._sum.discount ?? 0) + (extrasAll._sum.amount ?? 0),
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
          extras: extrasBy.get(String(b.id))?.sum ?? 0,
          keptPrepay: b.kept_prepay,
        };
      }),
    };
  }

  /* ── аналитика ──────────────────────────────────────────────────────
     Главный вопрос руководителя — окупается ли клуб и куда бить.
     Считаем по броням, которые состоялись: отменённые не в счёт. */

  @Get('stats')
  @Needs('analytics')
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
    const EVENING = 18;
    // Часы продажи считаем по каждому дню периода: выходные и короткие дни
    // не должны раздувать ёмкость
    let dayHoursTotal = 0, eveningHoursTotal = 0;
    for (let i = 0; i < days; i++) {
      const dh = hoursOn(set, shiftDate(from, i));
      if (dh.closed) continue;
      dayHoursTotal += Math.max(0, dh.close - dh.open);
      eveningHoursTotal += Math.max(0, dh.close - Math.max(dh.open, EVENING));
    }
    const dayHours = Math.max(1, Math.round(dayHoursTotal / days));

    const load = async (a: string, b: string) => this.db.bookings.findMany({
      where: { starts_at: { gte: clubHour(a, 0), lt: clubHour(shiftDate(b, 1), 0) } },
      select: {
        id: true, court_id: true, client_id: true, starts_at: true, ends_at: true,
        status: true, price: true, source: true, created_at: true,
        discount: true, players: true, status_at: true, status_by: true,
        kept_prepay: true,
      },
    });

    /** Платежи периода, разложенные по броням и по способам. */
    const money = async (a: string, b: string) => this.db.payments.findMany({
      where: { bookings: { starts_at: { gte: clubHour(a, 0), lt: clubHour(shiftDate(b, 1), 0) } } },
      select: { booking_id: true, amount: true, method: true, kind: true },
    });

    /** Прочие продажи периода: бар, прокат, тренировки. */
    /** Все продажи периода (по дню продажи; у строки счёта брони — день игры). */
    const otherSales = async (a: string, b: string) => this.db.sales.findMany({
      where: { day: { gte: new Date(a), lte: new Date(b) } },
      select: { category: true, amount: true, method: true, qty: true, cost: true, booking_id: true,
                bookings: { select: { status: true } } },
    });
    /** Взносы за турниры, начавшиеся в периоде. */
    const fees = async (a: string, b: string) => this.db.tournament_entries.findMany({
      where: { paid_amount: { gt: 0 }, tournaments: { starts_at: { gte: clubHour(a, 0), lt: clubHour(shiftDate(b, 1), 0) } } },
      select: { paid_amount: true, paid_method: true },
    });
    /** Расходы за период: расход месяца берётся пропорционально дням периода
     *  в этом месяце — неделя не должна «нести» аренду за весь месяц. */
    const costs = async (a: string, b: string) => {
      const rows = await this.db.expenses.findMany({
        where: { month: { gte: new Date(a.slice(0, 7) + '-01'), lte: new Date(b.slice(0, 7) + '-01') } },
        select: { category: true, amount: true, month: true },
      });
      const start = new Date(a + 'T00:00:00Z'), end = new Date(b + 'T00:00:00Z');
      return rows.map(r => {
        const m = new Date(Date.UTC(r.month.getUTCFullYear(), r.month.getUTCMonth(), 1));
        const mEnd = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0));
        const inMonth = mEnd.getUTCDate();
        const lo = start > m ? start : m, hi = end < mEnd ? end : mEnd;
        const covered = Math.max(0, Math.round((+hi - +lo) / 864e5) + 1);
        return { category: r.category, amount: Math.round(r.amount * covered / inMonth) };
      });
    };

    const [rows, prevRows, pays, prevPays, salesAll, prevSalesAll, exp, prevExp, feeRows, prevFeeRows] = await Promise.all([
      load(from, to), load(prevFrom, prevTo), money(from, to), money(prevFrom, prevTo),
      otherSales(from, to), otherSales(prevFrom, prevTo), costs(from, to), costs(prevFrom, prevTo),
      fees(from, to), fees(prevFrom, prevTo),
    ]);
    const paidTotal = (list: { amount: number }[]) => list.reduce((n, p) => n + p.amount, 0);

    // В аналитику идут только настоящие брони. Раньше считалось «всё, кроме
    // отменённых», и в выручку, загрузку и средний чек попадали заявки, которые
    // никто не подтвердил (ждут или сгорели). Корты под турниром — занятость
    // есть, а чека нет: их не считаем ни в брони, ни в средний чек.
    const REAL = new Set(['confirmed', 'done', 'no_show']);
    const PLAYED = new Set(['confirmed', 'done']);
    const isClientBooking = (b: { source: string }) => b.source !== 'tournament';

    // Строки счёта (прокат, мячи к брони) идут в «начислено» по своей брони,
    // остальные продажи — отдельной строкой. Так ничего не считается дважды.
    const extrasFor = async (list: typeof rows) => {
      const played = list.filter(b => PLAYED.has(b.status));
      return this.extrasOf(played.map(b => b.id));
    };
    const [extrasNow, extrasPrev] = await Promise.all([extrasFor(rows), extrasFor(prevRows)]);
    const dueOf = (b: typeof rows[number], ex: Map<string, { sum: number }>) =>
      Math.max(0, b.price - b.discount) + (ex.get(String(b.id))?.sum ?? 0);
    // Продажа — выручка, если она состоялась: строка счёта брони — только
    // у сыгранной брони (у отменённой и неявки строки убираются), продажа
    // клиенту — всегда
    const realSale = (x: typeof salesAll[number]) =>
      x.method !== 'bill' || (x.bookings != null && PLAYED.has(x.bookings.status));
    const sales = salesAll.filter(realSale);
    const prevSales = prevSalesAll.filter(realSale);

    /** Сколько денег пришло по каждой броне. */
    const paidPer = (payList: { amount: number; booking_id: bigint }[]) => {
      const m = new Map<string, number>();
      for (const p of payList) m.set(String(p.booking_id), (m.get(String(p.booking_id)) ?? 0) + p.amount);
      return m;
    };
    /** Удержанные предоплаты: человек не пришёл или отменил поздно, деньги
     *  остались клубу. Это выручка, но не «начислено по прайсу»: клуб получил
     *  ровно то, что было внесено. Новых платежей при удержании не создаётся. */
    const keptOf = (list: typeof rows, payList: { amount: number; booking_id: bigint }[]) => {
      const per = paidPer(payList);
      return list.filter(b => b.kept_prepay && !PLAYED.has(b.status) && isClientBooking(b))
        .reduce((n, b) => n + Math.max(0, per.get(String(b.id)) ?? 0), 0);
    };

    /** Свод по набору броней. */
    const sum = (list: typeof rows, payList: { amount: number; booking_id: bigint }[], ex: Map<string, { sum: number }>) => {
      const live = list.filter(b => REAL.has(b.status));
      const played = live.filter(b => PLAYED.has(b.status));
      const playedIds = new Set(played.map(b => String(b.id)));
      const hoursOf = (b: typeof rows[number]) =>
        Math.round((+b.ends_at - +b.starts_at) / 3600_000);
      const bookedHours = played.reduce((n, b) => n + hoursOf(b), 0);
      return {
        bookings: live.filter(isClientBooking).length,
        hours: bookedHours,
        // Аренда кортов: цена минус скидка по сыгранным броням плюс удержанные
        // предоплаты. Ракетки и мячи из счёта брони сюда НЕ входят — они
        // в своих категориях продаж, иначе посчитались бы дважды.
        charged: played.filter(isClientBooking).reduce((n, b) => n + Math.max(0, b.price - b.discount), 0) + keptOf(list, payList),
        kept: keptOf(list, payList),
        // К оплате по сыгранным: корт и строки счёта — с этим сравнивают кассу
        due: played.filter(isClientBooking).reduce((n, b) => n + dueOf(b, ex), 0),
        playedCount: played.filter(isClientBooking).length,
        received: paidTotal(payList),
        // Получено по состоявшимся броням — только это сравнивают с «начислено»
        receivedPlayed: paidTotal(payList.filter(p => playedIds.has(String(p.booking_id)))),
        cancels: list.filter(b => b.status === 'cancelled').length,
        noShows: list.filter(b => b.status === 'no_show').length,
      };
    };

    const now = sum(rows, pays, extrasNow);
    const prev = sum(prevRows, prevPays, extrasPrev);

    // ── Деньги клуба по категориям. Каждый рубль — ровно в одной категории:
    //    аренда кортов, удержанные предоплаты, прокат, товары, бар,
    //    тренировки, прочее, турнирные взносы. Выручка − себестоимость
    //    проданных товаров − расходы = прибыль. Переключателя «учитывать
    //    продажи» больше нет: из-за него цифры расходились.
    const SALE_CATS: [string, string][] = [['rental', 'Прокат'], ['shop', 'Товары'], ['bar', 'Бар'],
      ['coaching', 'Тренировки'], ['other', 'Прочее']];
    const moneyOf = (s0: ReturnType<typeof sum>, list: typeof sales, feeList: typeof feeRows, expList: typeof exp) => {
      const cats = [
        { key: 'courts', label: 'Аренда кортов', revenue: s0.charged - s0.kept, cost: 0, qty: s0.hours, unit: 'ч' },
        { key: 'kept', label: 'Удержанные предоплаты', revenue: s0.kept, cost: 0, qty: s0.noShows, unit: '' },
        ...SALE_CATS.map(([key, label]) => {
          const l = list.filter(x => x.category === key);
          return { key, label, revenue: l.reduce((n, x) => n + x.amount, 0), cost: l.reduce((n, x) => n + (x.cost ?? 0), 0),
            qty: l.reduce((n, x) => n + x.qty, 0), unit: key === 'rental' ? 'раз' : 'шт.',
            costMissing: key !== 'rental' && l.some(x => x.cost == null) };
        }),
        { key: 'fees', label: 'Турнирные взносы', revenue: feeList.reduce((n, x) => n + x.paid_amount, 0), cost: 0,
          qty: feeList.length, unit: 'чел.' },
      ];
      const revenue = cats.reduce((n, c) => n + c.revenue, 0);
      const cogs = cats.reduce((n, c) => n + c.cost, 0);
      const expenses = expList.reduce((n, x) => n + x.amount, 0);
      return { cats, revenue, cogs, expenses, profit: revenue - cogs - expenses };
    };
    const moneyNow = moneyOf(now, sales, feeRows, exp);
    const moneyPrev = moneyOf(prev, prevSales, prevFeeRows, prevExp);
    // Прежние поля — для совместимости экранов
    const otherRevenue = moneyNow.revenue - now.charged;
    const prevOther = moneyPrev.revenue - prev.charged;
    const spent = moneyNow.expenses;
    const prevSpent = moneyPrev.expenses;
    // Деньги, пришедшие не через бронь: продажи клиенту и взносы — в «получено»
    const directSales = sales.filter(x => x.method !== 'bill');
    const receivedAll = now.received + directSales.reduce((n, x) => n + x.amount, 0)
      + feeRows.reduce((n, x) => n + x.paid_amount, 0);
    const prevReceivedAll = prev.received + prevSales.filter(x => x.method !== 'bill').reduce((n, x) => n + x.amount, 0)
      + prevFeeRows.reduce((n, x) => n + x.paid_amount, 0);

    const hoursOf = (b: typeof rows[number]) => Math.round((+b.ends_at - +b.starts_at) / 3600_000);
    const played = rows.filter(b => PLAYED.has(b.status));

    // Загрузка: сколько часов продано из всех, что были в продаже
    const capacity = openCourts * dayHoursTotal;
    const eveningCapacity = openCourts * eveningHoursTotal;
    let eveningSold = 0;
    const byHour = new Map<number, { hours: number; revenue: number }>();
    const byCourt = new Map<string, { hours: number; revenue: number }>();
    const byWeekday = new Map<number, { hours: number; revenue: number }>();

    for (const b of played) {
      const start = hourOf(b.starts_at);
      const n = hoursOf(b);
      const net = Math.max(0, b.price - b.discount);
      const perHour = n > 0 ? Math.round(net / n) : net;
      const wd = weekdayOf(this.dateOf(b.starts_at));
      for (let i = 0; i < n; i++) {
        const h = start + i;
        if (h >= EVENING) eveningSold++;
        const cur = byHour.get(h) ?? { hours: 0, revenue: 0 };
        byHour.set(h, { hours: cur.hours + 1, revenue: cur.revenue + perHour });
      }
      const c = byCourt.get(b.court_id) ?? { hours: 0, revenue: 0 };
      // Выручка площадки — со скидкой, как в своде по категориям
      byCourt.set(b.court_id, { hours: c.hours + n, revenue: c.revenue + net });
      const w = byWeekday.get(wd) ?? { hours: 0, revenue: 0 };
      byWeekday.set(wd, { hours: w.hours + n, revenue: w.revenue + Math.max(0, b.price - b.discount) });
    }

    // Кто платил и чем: СБП отдельно от карты — комиссии разные
    const byMethod: Record<string, number> = Object.fromEntries(PAY_METHODS.map(m => [m, 0]));
    let refunded = 0;
    for (const p of pays) {
      byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;
      if (p.kind === 'refund') refunded += -p.amount;
    }
    for (const x of directSales) byMethod[x.method] = (byMethod[x.method] ?? 0) + x.amount;
    for (const f of feeRows) if (f.paid_method) byMethod[f.paid_method] = (byMethod[f.paid_method] ?? 0) + f.paid_amount;

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

    // Упущенное: отменённые и неявочные часы в рублях за вычетом того,
    // что клуб всё-таки удержал с этих броней
    const paidByBooking = paidPer(pays);
    const lost = rows.filter(b => (b.status === 'cancelled' || b.status === 'no_show') && isClientBooking(b))
      .reduce((n, b) => n + Math.max(0, b.price - b.discount
        - (b.kept_prepay ? Math.max(0, paidByBooking.get(String(b.id)) ?? 0) : 0)), 0);

    // Поздние отмены — по просьбе клиента позже бесплатной границы.
    // Отмены самим клубом сюда не входят.
    const lateCancels = rows.filter(b =>
      b.status === 'cancelled' && b.status_at != null && (b.status_by ?? '').startsWith('client') &&
      +b.starts_at - +b.status_at < set.cancelHours * 3600_000).length;

    // Сколько человек побывало и сколько принёс каждый
    const guests = played.reduce((n, b) => n + (b.players ?? 0), 0);
    const withPlayers = played.filter(b => b.players != null).length;
    const discounts = rows.filter(b => REAL.has(b.status))
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
        spent: cur.spent + dueOf(b, extrasNow),
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
                   status: { in: ['confirmed', 'done'] } },
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
      // Только аренда: удержанные предоплаты и продажи здесь не нужны
      revPerCourtHour: capacity ? Math.round((now.charged - now.kept) / capacity) : 0,
      // Средний чек сыгранной брони: корт со скидкой плюс её строки счёта
      averageCheck: now.playedCount ? Math.round(now.due / now.playedCount) : 0,
      occupancy: capacity ? now.hours / capacity : 0,
      eveningOccupancy: eveningCapacity ? eveningSold / eveningCapacity : 0,
      // Долг: к оплате по сыгранным броням (корт + строки счёта) минус внесённое по ним
      unpaid: Math.max(0, now.due - now.receivedPlayed),
      // Получено всего: по броням, продажи клиентам и турнирные взносы
      receivedAll, prevReceivedAll,
      // Деньги по категориям — главный свод: выручка, себестоимость, расходы, прибыль
      money: { ...moneyNow, prev: { revenue: moneyPrev.revenue, cogs: moneyPrev.cogs, profit: moneyPrev.profit,
        cats: moneyPrev.cats.map(c => ({ key: c.key, revenue: c.revenue })) } },
      byMethod, refunded, kept: now.kept, lost, bookingDepth, lateCancels, discounts,
      // Магазин и прокат за период: продано, выручка, прибыль, остатки
      shop: await this.shopSummary(from, to),
      // Деньги клуба целиком: аренда кортов плюс бар, прокат и тренировки,
      // минус расходы месяцев, попавших в период
      otherRevenue, prevOther, spent, prevSpent,
      profit: moneyNow.profit,
      prevProfit: moneyPrev.profit,
      byExpense: groupSum(exp),
      bySale: groupSum(sales),
      salesInStats: true,
      guests, guestsKnown: withPlayers, playedCount: played.length,
      revPerGuest: guests ? Math.round(now.due / guests) : 0,
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
        app: rows.filter(b => b.source === 'app' && REAL.has(b.status)).length,
        admin: rows.filter(b => b.source === 'admin' && REAL.has(b.status)).length,
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
    await this.db.expenses.delete({ where: { id: bigId(id) } });
    await this.auth.log(req.admin, 'удалил расход', `№${id}`);
    return { ok: true };
  }

  @Get('sales')
  @Needs('analytics')
  async sales(@Query('from') from?: string, @Query('to') to?: string) {
    const a = from && isValidDate(from) ? from : shiftDate(clubToday(), -30);
    const b = to && isValidDate(to) ? to : clubToday();
    const rows = await this.db.sales.findMany({
      where: { day: { gte: new Date(a), lte: new Date(b) } },
      orderBy: [{ day: 'desc' }, { id: 'desc' }], take: 3000,
    });
    const bIds = rows.map(r => r.booking_id).filter((x): x is bigint => x != null);
    const bookings = bIds.length ? await this.db.bookings.findMany({
      where: { id: { in: bIds } }, include: { clients: true, courts: true } }) : [];
    const bMap = new Map(bookings.map(b => [String(b.id), b]));
    const cIds = rows.map(r => r.client_id).filter((x): x is bigint => x != null);
    const cMap = new Map((cIds.length ? await this.db.clients.findMany({ where: { id: { in: cIds } } }) : [])
      .map(c => [String(c.id), c]));
    return rows.map(r => {
      const b = r.booking_id ? bMap.get(String(r.booking_id)) : null;
      const c = r.client_id ? cMap.get(String(r.client_id)) : null;
      return {
        client: c ? { id: Number(c.id), name: [c.name, c.surname].filter(Boolean).join(' ') } : null,
        id: Number(r.id), day: r.day.toISOString().slice(0, 10),
        category: r.category, amount: r.amount, method: r.method,
        qty: r.qty, note: r.note, item: r.item, by: r.admin_name, at: r.created_at,
        booking: b ? {
          id: Number(b.id), name: b.clients?.name ?? b.guest_name ?? 'Без имени',
          court: b.courts?.name ?? b.court_id, hour: hourOf(b.starts_at), date: this.dateOf(b.starts_at),
        } : null,
      };
    });
  }

  /** Касса: несколько товаров одной покупкой. Только товары из учёта — без
   *  «впишите своё»: так остаток всегда списывается, цена берётся из карточки
   *  и ошибиться в сумме нельзя. Всё или ничего — одной транзакцией. */
  @Post('sales/checkout')
  async checkout(@Req() req: any, @Body() body: {
    bookingId?: number; clientId?: number; method?: string; note?: string;
    lines?: { productId?: number; qty?: number }[];
  }) {
    if (!(await this.club.get()).salesOn) throw new BadRequestException('Продажи выключены в настройках');
    // Одинаковые товары складываем в одну строку
    const want = new Map<string, number>();
    for (const l of Array.isArray(body.lines) ? body.lines : []) {
      if (!l?.productId) continue;
      const k = String(bigId(String(l.productId)));
      want.set(k, (want.get(k) ?? 0) + int(l.qty, 1, 1, 999));
    }
    if (!want.size) throw new BadRequestException('Корзина пуста — выберите товар');
    if (want.size > 30) throw new BadRequestException('Слишком много позиций в одной продаже');

    // Кому: к брони (окно SALE_WINDOW_H) или клиенту «сейчас». Без человека — нельзя.
    let booking: { id: bigint; starts_at: Date; ends_at: Date; status: string;
                   tournament_id: bigint | null; client_id: bigint | null } | null = null;
    let clientId: bigint | null = null;
    if (body.bookingId) {
      booking = await this.db.bookings.findUnique({ where: { id: bigId(String(body.bookingId)) } });
      if (!booking) throw new NotFoundException('Бронь не найдена');
      if (booking.tournament_id) throw new ConflictException('Это корт под турниром — к нему продажи не записывают');
      if (!['pending', 'confirmed', 'done'].includes(booking.status)) {
        throw new ConflictException('К отменённой или сгоревшей брони ничего не добавить');
      }
      if (!saleWindowOk(booking.starts_at, booking.ends_at)) {
        throw new ConflictException(`Игра закончилась больше ${SALE_WINDOW_H} ч назад — задним числом к брони не добавляют. Запишите продажу клиенту`);
      }
      clientId = booking.client_id;
    } else if (body.clientId) {
      const c = await this.db.clients.findUnique({ where: { id: bigId(String(body.clientId)) } });
      if (!c) throw new NotFoundException('Клиент не найден');
      clientId = c.id;
    } else {
      throw new BadRequestException('Выберите бронь или клиента');
    }
    const method = booking ? 'bill' : String(body.method ?? 'cash');
    if (!booking && !PAY_METHODS.includes(method)) throw new BadRequestException('Такого способа оплаты нет');
    const day = booking ? this.dateOf(booking.starts_at) : clubToday();
    const note = body.note ? String(body.note).trim().slice(0, 200) : null;
    const adminId = BigInt(req.admin.id);

    const done = await this.db.$transaction(async tx => {
      const out: { name: string; qty: number; amount: number }[] = [];
      for (const [pid, qty] of want) {
        const pr = await tx.products.findUnique({ where: { id: BigInt(pid) } });
        if (!pr) throw new NotFoundException('Товар не найден');
        if (!pr.is_active) throw new ConflictException(`«${pr.name}» снят с продажи`);
        const fromStock = pr.category !== 'rental' && pr.stock != null;
        if (fromStock) {
          // Под блокировкой: два кассира не продадут последнюю банку дважды
          const upd = await tx.products.updateMany({ where: { id: pr.id, stock: { gte: qty } }, data: { stock: { decrement: qty } } });
          if (!upd.count) {
            const cur = await tx.products.findUnique({ where: { id: pr.id }, select: { stock: true } });
            throw new ConflictException(`«${pr.name}»: на складе только ${cur?.stock ?? 0} шт.`);
          }
        }
        const amount = pr.price * qty;
        const sale = await tx.sales.create({ data: {
          day: new Date(day), category: pr.category, amount, method, qty, note, item: pr.name,
          booking_id: booking?.id ?? null, client_id: clientId, product_id: pr.id,
          cost: pr.category !== 'rental' && pr.cost != null ? pr.cost * qty : null,
          admin_id: adminId, admin_name: req.admin.name,
        }});
        if (fromStock) {
          const after = await tx.products.findUnique({ where: { id: pr.id }, select: { stock: true } });
          await tx.stock_moves.create({ data: {
            product_id: pr.id, kind: 'sale', qty: -qty, stock_after: after?.stock ?? null, sale_id: sale.id,
            note: booking ? `к брони №${Number(booking.id)}` : `клиенту ID ${Number(clientId)}`,
            admin_id: adminId, admin_name: req.admin.name,
          }});
        }
        out.push({ name: pr.name, qty, amount });
      }
      return out;
    });
    const total = done.reduce((n, x) => n + x.amount, 0);
    await this.auth.log(req.admin, booking ? 'добавил к брони' : 'продал клиенту',
      done.map(x => `${x.name}${x.qty > 1 ? ` × ${x.qty}` : ''}`).join(', ')
      + `, ${(total / 100).toLocaleString('ru-RU')} ₽` + (booking ? `, бронь №${Number(booking.id)}` : `, клиент ID ${Number(clientId)}`));
    return { total, lines: done.length };
  }

  /** Продать воду, прокат ракетки, тренировку. Это работа стойки. */
  @Post('sales')
  async saveSale(@Req() req: any, @Body() body: {
    day?: string; category?: string; amount?: number; method?: string;
    qty?: number; note?: string; item?: string; bookingId?: number; clientId?: number;
    productId?: number;
  }) {
    if (!(await this.club.get()).salesOn) throw new BadRequestException('Продажи выключены в настройках');
    const CATS = ['bar', 'rental', 'coaching', 'shop', 'other'];
    let category = String(body.category ?? 'other');
    if (!CATS.includes(category)) throw new BadRequestException('Неизвестная статья продаж');
    const qty = int(body.qty, 1, 1, 999);
    let amount = rubToKop(body.amount);

    // Товар из магазина: имя, статья и цена — из карточки товара, остаток списываем
    let product: { id: bigint; name: string; price: number; category: string; stock: number | null; cost: number | null } | null = null;
    if (body.productId) {
      product = await this.db.products.findUnique({ where: { id: bigId(String(body.productId)) } });
      if (!product) throw new NotFoundException('Товар не найден');
      category = product.category;
      if (amount <= 0) amount = product.price * qty;
      // Прокат вещь не забирает — остаток не трогаем
      if (product.category !== 'rental' && product.stock != null && product.stock < qty) {
        throw new ConflictException(`На складе только ${product.stock} шт.`);
      }
    }
    const fromStock = !!product && product.category !== 'rental' && product.stock != null;
    if (amount <= 0) throw new BadRequestException('Сумма должна быть больше нуля');
    // Продают только товары из учёта (заказчик, 19.09.2026): иначе остаток не
    // списывается и цена вписывается руками
    if (!product) throw new BadRequestException('Выберите товар из списка — свои позиции не записываются');

    // Кому продажа (решение заказчика 19.09.2026, D28): к брони или клиенту.
    // Без человека продажу не записать. Задним числом — тоже:
    //  • к брони — только к той, что идёт сейчас, закончилась не больше
    //    SALE_WINDOW_H часов назад или ещё будет сегодня;
    //  • клиенту — дата и время ставятся сами, «сейчас», выбрать другие нельзя.
    let booking: { id: bigint; starts_at: Date; ends_at: Date; status: string;
                   tournament_id: bigint | null; client_id: bigint | null } | null = null;
    let clientId: bigint | null = null;
    if (body.bookingId) {
      booking = await this.db.bookings.findUnique({ where: { id: bigId(String(body.bookingId)) } });
      if (!booking) throw new NotFoundException('Бронь не найдена');
      if (booking.tournament_id) throw new ConflictException('Это корт под турниром — к нему продажи не записывают');
      if (!['pending', 'confirmed', 'done'].includes(booking.status)) {
        throw new ConflictException('К отменённой или сгоревшей брони ничего не добавить');
      }
      if (!saleWindowOk(booking.starts_at, booking.ends_at)) {
        throw new ConflictException(`Игра закончилась больше ${SALE_WINDOW_H} ч назад — задним числом к брони не добавляют. Запишите продажу клиенту`);
      }
      clientId = booking.client_id;
    } else if (body.clientId) {
      const c = await this.db.clients.findUnique({ where: { id: bigId(String(body.clientId)) } });
      if (!c) throw new NotFoundException('Клиент не найден');
      clientId = c.id;
    } else {
      throw new BadRequestException('Выберите бронь или клиента');
    }
    // К брони — строка её счёта, платят вместе с кортом; клиенту — сразу на стойке
    const method = booking ? 'bill' : String(body.method ?? 'cash');
    if (!booking && !PAY_METHODS.includes(method)) throw new BadRequestException('Такого способа оплаты нет');
    const day = booking ? this.dateOf(booking.starts_at) : clubToday();

    const r = await this.db.$transaction(async tx => {
      if (fromStock) {
        // Списание под блокировкой: два кассира не продадут последнюю банку дважды
        const upd = await tx.products.updateMany({
          where: { id: product!.id, stock: { gte: qty } }, data: { stock: { decrement: qty } } });
        if (!upd.count) throw new ConflictException('Товар закончился');
      }
      const sale = await tx.sales.create({ data: {
        day: new Date(day), category, amount, method, qty,
        note: body.note ? String(body.note).trim().slice(0, 200) : null,
        item: (body.item ? String(body.item).trim().slice(0, 120) : null) ?? product?.name ?? null,
        booking_id: booking?.id ?? null, client_id: clientId, product_id: product?.id ?? null,
        // Себестоимость — только у товара с известной закупкой; у проката её нет
        cost: product && product.category !== 'rental' && product.cost != null ? product.cost * qty : null,
        admin_id: BigInt(req.admin.id), admin_name: req.admin.name,
      }});
      if (fromStock) {
        const after = await tx.products.findUnique({ where: { id: product!.id }, select: { stock: true } });
        await tx.stock_moves.create({ data: {
          product_id: product!.id, kind: 'sale', qty: -qty, stock_after: after?.stock ?? null,
          sale_id: sale.id, admin_id: BigInt(req.admin.id), admin_name: req.admin.name,
          note: booking ? `к брони №${Number(booking.id)}` : `клиенту ID ${Number(clientId)}`,
        }});
      }
      return sale;
    });
    await this.auth.log(req.admin, booking ? 'добавил к брони' : 'продал клиенту',
      `${body.item ? String(body.item).slice(0, 120) : product?.name ?? SALE_WORD[category]}${qty > 1 ? ` × ${qty}` : ''}, ${(amount / 100).toLocaleString('ru-RU')} ₽`
      + (booking ? `, бронь №${Number(booking.id)}` : `, клиент ID ${Number(clientId)}`));
    return { id: Number(r.id) };
  }

  /** Брони, к которым прямо сейчас можно добавить продажу: идущие, будущие
   *  и закончившиеся не раньше SALE_WINDOW_H часов назад. Для окна «Продажа». */
  @Get('sale-bookings')
  async saleBookings() {
    const now = new Date();
    const rows = await this.db.bookings.findMany({
      where: {
        status: { in: ['pending', 'confirmed', 'done'] }, tournament_id: null,
        ends_at: { gte: new Date(+now - SALE_WINDOW_H * 3600_000) },
      },
      orderBy: { starts_at: 'asc' }, include: { clients: true, courts: true }, take: 300,
    });
    return {
      windowHours: SALE_WINDOW_H,
      bookings: rows.map(b => ({
        id: Number(b.id), date: this.dateOf(b.starts_at), hour: hourOf(b.starts_at),
        hours: Math.round((+b.ends_at - +b.starts_at) / 3600_000), status: b.status,
        startsAt: b.starts_at, endsAt: b.ends_at,
        courtName: b.courts?.name ?? b.court_id, color: colorOf(b.courts?.color ?? null),
        name: [b.clients?.name, b.clients?.surname].filter(Boolean).join(' ') || b.guest_name || 'Без имени',
        clientId: b.client_id ? Number(b.client_id) : null,
      })),
    };
  }

  /* ── мини-магазин ─────────────────────────────────────────────────── */

  @Get('products')
  async products() {
    const rows = await this.db.products.findMany({ orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] });
    // Сколько продано и принесло за 30 дней — видно прямо на карточке товара
    const since = new Date(shiftDate(clubToday(), -29));
    const sold = await this.db.sales.groupBy({
      by: ['product_id'], where: { product_id: { not: null }, day: { gte: since } },
      _sum: { qty: true, amount: true, cost: true },
    });
    const by = new Map(sold.map(x => [String(x.product_id), x._sum]));
    return rows.map(p => ({
      id: Number(p.id), name: p.name, price: p.price, category: p.category, cost: p.cost,
      photoUrl: p.photo_url, stock: p.stock, isActive: p.is_active, sortOrder: p.sort_order,
      sold30: by.get(String(p.id))?.qty ?? 0, revenue30: by.get(String(p.id))?.amount ?? 0,
    }));
  }

  /** Завести товар или поправить: название, цена, закупка, статья, остаток.
   *  Статья «прокат» — вещь возвращается, со склада не уходит. */
  @Post('products')
  @Needs('prices')
  async saveProduct(@Req() req: any, @Body() body: Partial<{
    id: number; name: string; price: number; cost: number | null; category: string; stock: number | null; isActive: boolean;
  }>) {
    const data: any = { updated_at: new Date() };
    if (body.name != null) {
      const n = String(body.name).trim().slice(0, 120);
      if (n.length < 2) throw new BadRequestException('Название от 2 знаков');
      data.name = n;
    }
    if (body.price != null) data.price = rubToKop(Math.max(0, Number(body.price)));
    if (body.cost !== undefined) data.cost = body.cost == null || body.cost === ('' as any)
      ? null : rubToKop(Math.max(0, Number(body.cost)));
    if (body.category != null) {
      if (!['shop', 'rental', 'bar', 'coaching', 'other'].includes(String(body.category))) {
        throw new BadRequestException('Неизвестная статья');
      }
      data.category = String(body.category);
    }
    const stock = body.stock === undefined ? undefined
      : body.stock == null || body.stock === ('' as any) ? null : int(body.stock, 0, 0, 100000);
    if (body.isActive != null) data.is_active = !!body.isActive;

    if (body.id) {
      const before = await this.db.products.findUnique({ where: { id: bigId(String(body.id)) } });
      if (!before) throw new NotFoundException('Товар не найден');
      // Остаток правится через приход, списание и пересчёт — у каждого
      // изменения есть строка в журнале. Здесь можно только включить или
      // выключить учёт остатка.
      if (stock === null) data.stock = null;
      else if (stock !== undefined && before.stock == null) data.stock = stock;
      const p = await this.db.$transaction(async tx => {
        const upd = await tx.products.update({ where: { id: before.id }, data });
        if (before.stock == null && upd.stock != null && upd.stock > 0) {
          await tx.stock_moves.create({ data: { product_id: upd.id, kind: 'count', qty: upd.stock,
            stock_after: upd.stock, note: 'начали вести остаток', admin_id: BigInt(req.admin.id), admin_name: req.admin.name } });
        }
        return upd;
      });
      await this.auth.log(req.admin, 'изменил товар', p.name);
      return { id: Number(p.id) };
    }
    if (!data.name || data.price == null) throw new BadRequestException('Нужны название и цена');
    const last = await this.db.products.findFirst({ orderBy: { sort_order: 'desc' } });
    const p = await this.db.$transaction(async tx => {
      const c = await tx.products.create({ data: {
        name: data.name, price: data.price, category: data.category ?? 'shop', cost: data.cost ?? null,
        stock: stock ?? null, is_active: data.is_active ?? true,
        sort_order: (last?.sort_order ?? 0) + 1,
      }});
      // Первый остаток — это приход: он попадает в журнал движений
      if (c.stock != null && c.stock > 0) {
        await tx.stock_moves.create({ data: { product_id: c.id, kind: 'receipt', qty: c.stock, stock_after: c.stock,
          unit_cost: c.cost, note: 'начальный остаток', admin_id: BigInt(req.admin.id), admin_name: req.admin.name } });
      }
      return c;
    });
    await this.auth.log(req.admin, 'завёл товар', `${p.name}, ${(p.price / 100).toLocaleString('ru-RU')} ₽`);
    return { id: Number(p.id) };
  }

  /** Движение остатка: привезли (receipt), списали (writeoff: брак, потеря,
   *  взяли себе) или пересчитали (count: сколько реально лежит). */
  @Post('products/:id/move')
  @Needs('stock')
  async productMove(@Req() req: any, @Param('id') id: string, @Body() body: {
    kind?: string; qty?: number; unitCost?: number | null; note?: string;
  }) {
    const kind = String(body.kind ?? '');
    if (!['receipt', 'writeoff', 'count'].includes(kind)) throw new BadRequestException('Неизвестное движение');
    const n = int(body.qty, -1, 0, 100000);
    if (n < 0 || (kind !== 'count' && n === 0)) throw new BadRequestException('Укажите количество');
    const note = body.note ? String(body.note).trim().slice(0, 200) : null;
    const unitCost = kind === 'receipt' && body.unitCost != null && body.unitCost !== ('' as any)
      ? rubToKop(Math.max(0, Number(body.unitCost))) : null;
    const res = await this.db.$transaction(async tx => {
      const p = await tx.products.findUnique({ where: { id: bigId(id) } });
      if (!p) throw new NotFoundException('Товар не найден');
      const cur = p.stock ?? 0;
      const next = kind === 'receipt' ? cur + n : kind === 'writeoff' ? cur - n : n;
      if (next < 0) throw new ConflictException(`На складе только ${cur} шт. — столько не списать`);
      const upd = await tx.products.update({ where: { id: p.id }, data: {
        stock: next, updated_at: new Date(), ...(unitCost != null ? { cost: unitCost } : {}) } });
      await tx.stock_moves.create({ data: {
        product_id: p.id, kind, qty: next - cur, unit_cost: unitCost, stock_after: next, note,
        admin_id: BigInt(req.admin.id), admin_name: req.admin.name,
      }});
      return { p: upd, cur, next };
    });
    const word = kind === 'receipt' ? 'приход товара' : kind === 'writeoff' ? 'списал товар' : 'пересчитал товар';
    await this.auth.log(req.admin, word, `${res.p.name}: ${res.cur} → ${res.next}${note ? ' · ' + note : ''}`);
    return { id: Number(res.p.id), stock: res.next };
  }

  /** Прежняя кнопка «±1»: плюс — приход, минус — списание. */
  @Post('products/:id/stock')
  @Needs('stock')
  async productStock(@Req() req: any, @Param('id') id: string, @Body() body: { delta?: number; set?: number }) {
    if (body.set != null) return this.productMove(req, id, { kind: 'count', qty: body.set });
    const d = Math.trunc(Number(body.delta ?? 0));
    if (!d) throw new BadRequestException('Укажите количество');
    return this.productMove(req, id, { kind: d > 0 ? 'receipt' : 'writeoff', qty: Math.abs(d) });
  }

  /** Журнал движений товара: приходы, продажи, возвраты, списания. */
  @Get('products/:id/moves')
  async productMoves(@Param('id') id: string) {
    const rows = await this.db.stock_moves.findMany({
      where: { product_id: bigId(id) }, orderBy: { id: 'desc' }, take: 300,
      include: { sales: { include: { bookings: { include: { clients: true } }, clients: true } } },
    });
    return rows.map(m => ({
      id: Number(m.id), kind: m.kind, qty: m.qty, unitCost: m.unit_cost, stockAfter: m.stock_after,
      note: m.note, by: m.admin_name, at: m.created_at,
      who: m.sales?.clients ? [m.sales.clients.name, m.sales.clients.surname].filter(Boolean).join(' ')
        : m.sales?.bookings?.guest_name ?? null,
      amount: m.sales?.amount ?? null,
    }));
  }

  /** Отчёт магазина и проката за период: по каждому товару — продано,
   *  выручка, себестоимость, прибыль; привезено; остаток и его стоимость. */
  @Get('shop-report')
  @Needs('analytics')
  async shopReport(@Query('from') fromQ?: string, @Query('to') toQ?: string) {
    const to = toQ && isValidDate(toQ) ? toQ : clubToday();
    const from = fromQ && isValidDate(fromQ) ? fromQ : shiftDate(to, -29);
    return this.shopSummary(from, to);
  }

  private async shopSummary(from: string, to: string) {
    const [products, sales, moves] = await Promise.all([
      this.db.products.findMany({ orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] }),
      this.db.sales.findMany({ where: { day: { gte: new Date(from), lte: new Date(to) } },
        select: { product_id: true, category: true, qty: true, amount: true, cost: true, item: true } }),
      this.db.stock_moves.findMany({ where: { kind: 'receipt',
        created_at: { gte: clubHour(from, 0), lt: clubHour(shiftDate(to, 1), 0) } },
        select: { product_id: true, qty: true, unit_cost: true } }),
    ]);
    const rows = products.map(p => {
      const mine = sales.filter(x => x.product_id === p.id);
      const rec = moves.filter(m => m.product_id === p.id);
      const revenue = mine.reduce((n, x) => n + x.amount, 0);
      const costKnown = mine.every(x => x.cost != null);
      const cost = mine.reduce((n, x) => n + (x.cost ?? 0), 0);
      return {
        id: Number(p.id), name: p.name, category: p.category, price: p.price, photoUrl: p.photo_url,
        isActive: p.is_active, stock: p.stock, unitCost: p.cost,
        qty: mine.reduce((n, x) => n + x.qty, 0), revenue,
        cost: p.category === 'rental' || !costKnown ? null : cost,
        profit: p.category === 'rental' ? revenue : costKnown ? revenue - cost : null,
        received: rec.reduce((n, m) => n + m.qty, 0),
        receivedCost: rec.every(m => m.unit_cost != null) ? rec.reduce((n, m) => n + m.qty * (m.unit_cost ?? 0), 0) : null,
        stockValue: p.stock != null && p.cost != null && p.category !== 'rental' ? p.stock * p.cost : null,
      };
    });
    // Продажи без карточки товара (строки прайса, свои позиции) — одной строкой по статье
    const loose = sales.filter(x => x.product_id == null);
    const byCat = (cats: string[], list = sales) => list.filter(x => cats.includes(x.category))
      .reduce((a, x) => ({ qty: a.qty + x.qty, revenue: a.revenue + x.amount }), { qty: 0, revenue: 0 });
    return {
      from, to, products: rows,
      loose: { qty: loose.reduce((n, x) => n + x.qty, 0), revenue: loose.reduce((n, x) => n + x.amount, 0) },
      goods: byCat(['shop', 'bar', 'other']),
      rental: byCat(['rental']),
      coaching: byCat(['coaching']),
      stockValue: rows.reduce((n, r) => n + (r.stockValue ?? 0), 0),
      lowStock: rows.filter(r => r.isActive && r.category !== 'rental' && r.stock != null && r.stock <= 3)
        .map(r => ({ id: r.id, name: r.name, stock: r.stock })),
    };
  }

  @Post('products/:id/photo')
  @Needs('prices')
  async productPhoto(@Req() req: any, @Param('id') id: string, @Body() body: { data?: string }) {
    const p = await this.db.products.findUnique({ where: { id: bigId(id) } });
    if (!p) throw new NotFoundException('Товар не найден');
    const url = await saveImage(body.data, 'products', 1000);
    await this.db.products.update({ where: { id: p.id }, data: { photo_url: url, updated_at: new Date() } });
    await dropUpload(p.photo_url);
    return { url };
  }

  /** Убрать товар. Если по нему были продажи — только выключаем, история остаётся. */
  @Post('products/:id/delete')
  @Needs('prices')
  async deleteProduct(@Req() req: any, @Param('id') id: string) {
    const p = await this.db.products.findUnique({ where: { id: bigId(id) } });
    if (!p) throw new NotFoundException('Товар не найден');
    const used = await this.db.sales.count({ where: { product_id: p.id } });
    if (used) {
      await this.db.products.update({ where: { id: p.id }, data: { is_active: false, updated_at: new Date() } });
      await this.auth.log(req.admin, 'выключил товар', p.name);
      return { ok: true, hidden: true };
    }
    await this.db.products.delete({ where: { id: p.id } });
    await dropUpload(p.photo_url);
    await this.auth.log(req.admin, 'удалил товар', p.name);
    return { ok: true };
  }

  /** Переключатели продаж: вести ли их и учитывать ли в аналитике. */
  @Post('sales-settings')
  @Needs('analytics')
  async salesSettings(@Req() req: any, @Body() body: { salesOn?: boolean; salesInStats?: boolean }) {
    const data: any = { updated_at: new Date() };
    if (body.salesOn != null) data.sales_on = !!body.salesOn;
    if (body.salesInStats != null) data.sales_in_stats = !!body.salesInStats;
    await this.db.settings.update({ where: { id: 1 }, data });
    this.club.forget();
    await this.auth.log(req.admin, 'изменил настройки продаж',
      [body.salesOn != null ? `продажи ${body.salesOn ? 'включены' : 'выключены'}` : '',
       body.salesInStats != null ? `в аналитике ${body.salesInStats ? 'учитываются' : 'не учитываются'}` : '']
        .filter(Boolean).join(', '));
    const set = await this.club.get();
    return { salesOn: set.salesOn, salesInStats: set.salesInStats };
  }

  @Post('sales/:id/delete')
  async deleteSale(@Req() req: any, @Param('id') id: string) {
    const row = await this.db.sales.findUnique({ where: { id: bigId(id) } });
    if (!row) throw new NotFoundException('Продажа не найдена');
    // Оплаченную продажу убирает только тот, кто может отменять; строку
    // неоплаченного счёта брони — любой на стойке
    if (row.method !== 'bill' && !this.auth.can(req.admin, 'cancel')) {
      throw new ForbiddenException('Нет доступа: удалять продажи');
    }
    // Строку счёта брони после окна продаж убрать может только тот, кто
    // может отменять: задним числом счёт не правят
    if (row.method === 'bill' && row.booking_id && !this.auth.can(req.admin, 'cancel')) {
      const b = await this.db.bookings.findUnique({ where: { id: row.booking_id } });
      if (b && !saleWindowOk(b.starts_at, b.ends_at)) {
        throw new ForbiddenException('Игра давно прошла — убрать строку счёта может только тот, у кого есть право отменять');
      }
    }
    await this.db.$transaction(async tx => {
      if (row.product_id) {
        const pr = await tx.products.findUnique({ where: { id: row.product_id } });
        if (pr && pr.category !== 'rental' && pr.stock != null) {
          const upd = await tx.products.update({ where: { id: pr.id }, data: { stock: { increment: row.qty } } });
          await tx.stock_moves.create({ data: {
            product_id: pr.id, kind: 'return', qty: row.qty, stock_after: upd.stock, sale_id: row.id,
            note: 'продажу убрали', admin_id: BigInt(req.admin.id), admin_name: req.admin.name,
          }});
        }
      }
      await tx.sales.delete({ where: { id: row.id } });
    });
    await this.auth.log(req.admin, 'удалил продажу', `№${id}`);
    return { ok: true };
  }

  /** Взнос за турнир. Раньше взнос был записан на турнире,
   *  а факта оплаты не было — «сколько собрано» никто не знал. */
  @Post('entries/:id/pay')
  @Needs('tournaments')
  async payEntry(@Req() req: any, @Param('id') id: string, @Body() body: {
    amount?: number; method?: string;
  }) {
    const e = await this.db.tournament_entries.findUnique({
      where: { id: bigId(id) }, include: { tournaments: true, clients: true },
    });
    if (!e) throw new NotFoundException('Запись на турнир не найдена');
    if (!['pending', 'confirmed'].includes(e.status)) throw new ConflictException('Заявка отменена — взнос не принимают');
    const method = String(body.method ?? 'cash');
    if (!PAY_METHODS.includes(method)) throw new BadRequestException('Такого способа оплаты нет');
    const amount = body.amount == null ? e.tournaments.fee : rubToKop(Math.max(0, Number(body.amount)));

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
      this.db.courts.findMany({ orderBy: { sort_order: 'asc' },
        include: { court_photos: { orderBy: [{ sort: 'asc' }, { id: 'asc' }] } } }),
      this.club.get(),
    ]);
    return {
      settings: set,
      // Цвета покрытия, из которых выбирает менеджер
      colors: colorList(),
      courts: courts.map(c => ({
        photos: c.court_photos.map(ph => ({ id: Number(ph.id), url: ph.url })),
        id: c.id, name: c.name, isFootball: c.is_football,
        priceMorning: c.price_morning, priceStandard: c.price_standard,
        isActive: c.is_active, sortOrder: c.sort_order, description: c.description,
        color: c.color, tags: c.tags,
        closedUntil: c.closed_until, closedReason: c.closed_reason,
      })),
    };
  }

  /** Часы работы, граница утреннего тарифа, предельная длина брони. */
  @Post('settings')
  @Needs('club')
  async saveSettings(@Body() body: Partial<{
    openHour: number; closeHour: number; morningUntil: number;
    week: { open: number; close: number; closed?: boolean }[];
    maxHours: number; cancelHours: number; holdMinutes: number;
    phone: string; whatsapp: string; address: string;
    mapUrl: string; instagram: string; telegram: string;
    prepayPercent: number; lateMinutes: number; rentalsText: string;
    showTournaments: boolean; showFootball: boolean; waTemplate: string;
    bookingNote: string;
  }>) {
    const cur = await this.club.get();

    // Часы по дням. Старый вид — одна пара на все дни — тоже понимаем.
    let week = cur.week;
    if (Array.isArray(body.week)) {
      if (body.week.length !== 7) throw new BadRequestException('Нужны часы на все 7 дней');
      week = body.week.map((d, i) => {
        const closed = !!d?.closed;
        const open = int(d?.open, -1, 0, 23);
        const close = int(d?.close, -1, 1, 24);
        if (open < 0 || close < 0) throw new BadRequestException(`${WEEKDAYS[i]}: часы от 0 до 24`);
        if (open >= close) throw new BadRequestException(`${WEEKDAYS[i]}: открытие должно быть раньше закрытия`);
        return { open, close, closed };
      });
    } else if (body.openHour !== undefined || body.closeHour !== undefined) {
      week = parseWeek(null, int(body.openHour, cur.openHour, 0, 23), int(body.closeHour, cur.closeHour, 1, 24));
    }
    const working = week.filter(d => !d.closed);
    if (!working.length) throw new BadRequestException('Хотя бы один день клуб должен работать');

    const next = {
      week_hours: week,
      open_hour: Math.min(...working.map(d => d.open)),
      close_hour: Math.max(...working.map(d => d.close)),
      morning_until: int(body.morningUntil, cur.morningUntil, 0, 24),
      max_hours: int(body.maxHours, cur.maxHours, 1, 12),
      cancel_hours: int(body.cancelHours, cur.cancelHours, 0, 48),
      hold_minutes: int(body.holdMinutes, cur.holdMinutes, 5, 1440),
      // Контакты: пустая строка означает «убрать», не заданное поле не трогаем
      phone: body.phone === undefined ? cur.phone : phoneOrNull(body.phone),
      whatsapp: body.whatsapp === undefined ? cur.whatsapp : phoneOrNull(body.whatsapp),
      address: body.address === undefined ? cur.address : (body.address.trim() || null),
      map_url: body.mapUrl === undefined ? cur.mapUrl : linkOrNull(body.mapUrl),
      instagram: body.instagram === undefined ? cur.instagram : linkOrNull(body.instagram),
      telegram: body.telegram === undefined ? cur.telegram : telegramOrNull(body.telegram),
      prepay_percent: int(body.prepayPercent, cur.prepayPercent, 0, 100),
      late_minutes: int(body.lateMinutes, cur.lateMinutes, 0, 120),
      rentals_text: body.rentalsText === undefined
        ? cur.rentalsText : (body.rentalsText.trim().slice(0, 800) || null),
      show_tournaments: body.showTournaments === undefined
        ? cur.showTournaments : !!body.showTournaments,
      show_football: body.showFootball === undefined ? cur.showFootball : !!body.showFootball,
      wa_template: body.waTemplate === undefined
        ? cur.waTemplate : (String(body.waTemplate).trim().slice(0, 500) || null),
      booking_note: body.bookingNote === undefined
        ? cur.bookingNote : (String(body.bookingNote).trim().slice(0, 200) || null),
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

  /** Загрузить фотографию площадки.
   *
   *  Файл приходит строкой base64 в JSON: так не нужна отдельная библиотека
   *  для составных запросов. Тип определяем по первым байтам файла, а не по
   *  тому, что прислал браузер, — иначе под видом картинки можно положить
   *  что угодно. Разрешены JPEG, PNG и WebP до 8 МБ. */
  @Post('courts/:id/photos')
  @Needs('club')
  async addPhoto(@Req() req: any, @Param('id') id: string, @Body() body: { data?: string }) {
    const court = await this.db.courts.findUnique({ where: { id } });
    if (!court) throw new NotFoundException('Площадка не найдена');
    const url = await saveImage(body.data, `courts/${court.id}`, 2000);

    const last = await this.db.court_photos.findFirst({
      where: { court_id: court.id }, orderBy: { sort: 'desc' } });
    const ph = await this.db.court_photos.create({ data: {
      court_id: court.id, url,
      sort: (last?.sort ?? -1) + 1,
    }});
    await this.auth.log(req.admin, 'загрузил фото площадки', court.name);
    return { id: Number(ph.id), url: ph.url };
  }

  @Post('photos/:id/delete')
  @Needs('club')
  async deletePhoto(@Req() req: any, @Param('id') id: string) {
    const ph = await this.db.court_photos.findUnique({ where: { id: bigId(id) } });
    if (!ph) throw new NotFoundException('Фото не найдено');
    await this.db.court_photos.delete({ where: { id: ph.id } });
    // Файл убираем с диска; если его уже нет — не беда, запись всё равно удалена
    const rel = ph.url.replace(/^\/uploads\//, '');
    if (!rel.includes('..')) await unlink(join(UPLOAD_DIR, rel)).catch(() => {});
    await this.auth.log(req.admin, 'удалил фото площадки', ph.court_id);
    return { ok: true };
  }

  /** Сделать фото главным: оно встанет первым — на карточку и в начало галереи. */
  @Post('photos/:id/main')
  @Needs('club')
  async mainPhoto(@Param('id') id: string) {
    const ph = await this.db.court_photos.findUnique({ where: { id: bigId(id) } });
    if (!ph) throw new NotFoundException('Фото не найдено');
    const first = await this.db.court_photos.findFirst({
      where: { court_id: ph.court_id }, orderBy: { sort: 'asc' } });
    await this.db.court_photos.update({ where: { id: ph.id },
      data: { sort: (first?.sort ?? 0) - 1 } });
    return { ok: true };
  }

  /** Фото первого экрана приложения. Своих фото два: для тёмной темы и для
   *  светлой — клубные снимки тёмные, на белом фоне они смотрятся чужеродно.
   *  Прежнее фото удаляется с диска. */
  @Post('hero')
  @Needs('club')
  async setHero(@Req() req: any, @Body() body: { data?: string; light?: boolean }) {
    const light = !!body.light;
    const url = await saveImage(body.data, 'club', 2400, `hero${light ? '-light' : ''}-`);
    const cur = await this.club.get();
    await this.db.settings.update({ where: { id: 1 },
      data: { [light ? 'hero_light_url' : 'hero_url']: url, updated_at: new Date() } });
    this.club.forget();
    await dropUpload(light ? cur.heroLightUrl : cur.heroUrl);
    await this.auth.log(req.admin,
      light ? 'сменил фото главного экрана (светлая тема)' : 'сменил фото главного экрана', url);
    return { heroUrl: light ? null : url, heroLightUrl: light ? url : null };
  }

  /** Вернуть встроенное в приложение фото первого экрана. */
  @Post('hero/delete')
  @Needs('club')
  async resetHero(@Req() req: any, @Body() body: { light?: boolean }) {
    const light = !!body.light;
    const cur = await this.club.get();
    await this.db.settings.update({ where: { id: 1 },
      data: { [light ? 'hero_light_url' : 'hero_url']: null, updated_at: new Date() } });
    this.club.forget();
    await dropUpload(light ? cur.heroLightUrl : cur.heroUrl);
    await this.auth.log(req.admin,
      light ? 'вернул стандартное фото главного экрана (светлая тема)'
            : 'вернул стандартное фото главного экрана', '');
    return { heroUrl: null, heroLightUrl: null };
  }

  /** Название, цены, цвет, особенности, порядок и включение площадки. */
  @Post('courts/:id')
  @Needs('club')
  async saveCourt(@Param('id') id: string, @Body() body: Partial<{
    name: string; priceMorning: number; priceStandard: number;
    isActive: boolean; sortOrder: number; description: string;
    color: string; tags: string | string[];
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
    // Пустой цвет — «не указан»; неизвестный ключ не принимаем молча
    if (body.color != null) {
      const key = String(body.color);
      if (key && !colorOf(key)) throw new BadRequestException('Такого цвета в списке нет');
      data.color = key || null;
    }
    if (body.tags != null) data.tags = cleanTags(body.tags);

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
    await this.db.price_rules.delete({ where: { id: bigId(id) } });
    this.club.forget();
    return { ok: true };
  }

  /** Турниры: список с числом записавшихся. */
  @Get('tournaments')
  async tournaments() {
    await this.club.releaseExpired();
    const rows = await this.db.tournaments.findMany({ orderBy: { starts_at: 'desc' } });
    const counts = await this.db.tournament_entries.groupBy({
      by: ['tournament_id', 'status'], where: { status: { in: ['pending', 'confirmed'] } }, _count: { _all: true },
    });
    const of = (id: bigint, st: string) =>
      counts.find(c => c.tournament_id === id && c.status === st)?._count._all ?? 0;
    return rows.map(t => ({
      id: Number(t.id), name: t.name, startsAt: t.starts_at, format: t.format,
      fee: t.fee, seats: t.seats, state: t.state, coverUrl: t.cover_url,
      resultText: t.result_text, taken: of(t.id, 'pending') + of(t.id, 'confirmed'),
      pending: of(t.id, 'pending'), confirmed: of(t.id, 'confirmed'),
      hours: t.hours, courtIds: t.court_ids,
      results: t.results, photos: t.result_photos, bannerOn: t.banner_on,
    }));
  }

  /** Обложка турнира: своё фото вместо готовых картинок. Загружается до
   *  сохранения турнира (новый турнир ещё без номера), путь приходит в форму
   *  и сохраняется вместе с турниром. Сжимается как все фото — до 2000 px. */
  @Post('tournaments/cover')
  @Needs('tournaments')
  async tournamentCover(@Req() req: any, @Body() body: { data?: string }) {
    const url = await saveImage(body.data, 'covers', 2000);
    await this.auth.log(req.admin, 'загрузил обложку турнира', url);
    return { url };
  }

  /** Фото с турнира — для итогов и баннера на главной. Не больше 12. */
  @Post('tournaments/:id/photos')
  @Needs('tournaments')
  async addTournamentPhoto(@Req() req: any, @Param('id') id: string, @Body() body: { data?: string }) {
    const t = await this.db.tournaments.findUnique({ where: { id: bigId(id) } });
    if (!t) throw new NotFoundException('Турнир не найден');
    if (t.result_photos.length >= 12) throw new BadRequestException('Не больше 12 фото — удалите лишние');
    const url = await saveImage(body.data, `tournaments/${t.id}`, 2000);
    await this.db.tournaments.update({ where: { id: t.id },
      data: { result_photos: [...t.result_photos, url] } });
    await this.auth.log(req.admin, 'загрузил фото турнира', t.name);
    return { url };
  }

  @Post('tournaments/:id/photos/delete')
  @Needs('tournaments')
  async deleteTournamentPhoto(@Req() req: any, @Param('id') id: string, @Body() body: { url?: string }) {
    const t = await this.db.tournaments.findUnique({ where: { id: bigId(id) } });
    if (!t) throw new NotFoundException('Турнир не найден');
    const url = String(body.url ?? '');
    if (!t.result_photos.includes(url)) throw new NotFoundException('Фото не найдено');
    await this.db.tournaments.update({ where: { id: t.id },
      data: { result_photos: t.result_photos.filter(u => u !== url) } });
    await dropUpload(url);
    await this.auth.log(req.admin, 'удалил фото турнира', t.name);
    return { ok: true };
  }

  /** Сделать фото первым — оно встанет на баннер. */
  @Post('tournaments/:id/photos/main')
  @Needs('tournaments')
  async mainTournamentPhoto(@Param('id') id: string, @Body() body: { url?: string }) {
    const t = await this.db.tournaments.findUnique({ where: { id: bigId(id) } });
    if (!t) throw new NotFoundException('Турнир не найден');
    const url = String(body.url ?? '');
    if (!t.result_photos.includes(url)) throw new NotFoundException('Фото не найдено');
    await this.db.tournaments.update({ where: { id: t.id },
      data: { result_photos: [url, ...t.result_photos.filter(u => u !== url)] } });
    return { ok: true };
  }

  /** Кто записался: имя, телефон, ID и состояние заявки. */
  @Get('tournaments/:id/entries')
  async entries(@Param('id') id: string) {
    await this.club.releaseExpired();
    const rows = await this.db.tournament_entries.findMany({
      where: { tournament_id: bigId(id) },
      orderBy: { created_at: 'asc' },
      include: { clients: true },
    });
    return rows.map(e => ({
      id: Number(e.id), clientId: Number(e.client_id),
      name: [e.clients.name, e.clients.surname].filter(Boolean).join(' '), phone: e.clients.phone,
      signedAt: e.created_at, status: e.status, holdUntil: e.hold_until,
      paid: e.paid_amount,
    }));
  }

  /** Подтвердить или отменить заявку на турнир — как бронь корта. */
  @Post('entries/:id/status')
  @Needs('tournaments')
  async setEntryStatus(@Req() req: any, @Param('id') id: string, @Body() body: { status: string }) {
    const status = String(body?.status);
    if (!['confirmed', 'cancelled'].includes(status)) {
      throw new BadRequestException('Можно подтвердить или отменить');
    }
    if (status === 'cancelled' && !this.auth.can(req.admin, 'cancel')) {
      throw new ForbiddenException('Нет доступа: отменять записи');
    }
    const e = await this.db.tournament_entries.findUnique({
      where: { id: bigId(id) }, include: { tournaments: true, clients: true } });
    if (!e) throw new NotFoundException('Заявка на турнир не найдена');
    if (status === 'confirmed' && (['done', 'cancelled'].includes(e.tournaments.state) || e.tournaments.starts_at <= new Date())) {
      throw new ConflictException('Турнир уже прошёл или отменён — подтверждать нечего');
    }

    if (status === 'confirmed' && e.status !== 'confirmed') {
      // Истёкшую или отменённую заявку можно вернуть, если есть место
      if (!['pending', 'confirmed'].includes(e.status)) {
        const taken = await this.db.tournament_entries.count({ where: {
          tournament_id: e.tournament_id, status: { in: ['pending', 'confirmed'] } } });
        if (taken >= e.tournaments.seats) throw new ConflictException('Мест больше нет');
      }
    }
    await this.db.tournament_entries.update({ where: { id: e.id }, data: {
      status, hold_until: null, status_at: new Date(), status_by: req.admin.login,
    }});

    if (e.status !== status) {
      const when = e.tournaments.starts_at.toLocaleString('ru-RU', {
        day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
      const fee = e.tournaments.fee > 0
        ? ` Взнос ${(e.tournaments.fee / 100).toLocaleString('ru-RU')} ₽ оплачивается в клубе.` : '';
      const t = status === 'confirmed'
        ? ['Вы записаны на турнир', `«${e.tournaments.name}». Приходите ${when}.${fee}`]
        : e.status === 'confirmed'
          ? ['Запись на турнир отменена', `«${e.tournaments.name}», ${when}. Если это ошибка, напишите менеджеру.`]
          : ['Заявка на турнир отклонена', `«${e.tournaments.name}», ${when}. Если это ошибка, напишите менеджеру.`];
      await this.notes.toClient(e.client_id, 'tournament', t[0], t[1], { by: req.admin.name });
    }
    await this.auth.log(req.admin, status === 'confirmed' ? 'подтвердил участие в турнире' : 'отменил участие в турнире',
      `${e.clients.name}, «${e.tournaments.name}»`);
    return { id: Number(e.id), status };
  }

  /** Завести турнир или изменить существующий. */
  @Post('tournaments')
  @Needs('tournaments')
  async saveTournament(@Req() req: any, @Body() body: Partial<{
    id: number; name: string; startsAt: string; format: string;
    fee: number; seats: number; state: string; coverUrl: string; resultText: string;
    hours: number; courtIds: string[];
    results: { place?: number; names?: string; prize?: string }[]; bannerOn: boolean;
  }>) {
    const STATES = ['soon', 'open', 'closed', 'done', 'cancelled'];
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
    if (body.coverUrl != null) {
      // Обложка — встроенная картинка приложения (t1…t4) или загруженное
      // клубом фото. Чужие ссылки не принимаем: приложение их не покажет.
      const c = String(body.coverUrl).trim();
      if (c && !/^t[1-4]$/.test(c) && !/^\/uploads\/covers\/[\w.-]+\.jpg$/.test(c)) {
        throw new BadRequestException('Обложку выберите из готовых или загрузите фото');
      }
      data.cover_url = c || null;
    }
    if (body.resultText != null) data.result_text = String(body.resultText).trim().slice(0, 2000) || null;
    if (body.results != null) {
      if (!Array.isArray(body.results)) throw new BadRequestException('Итоги должны быть списком мест');
      data.results = body.results
        .map((r, i) => ({
          place: int(r?.place ?? i + 1, i + 1, 1, 50),
          names: String(r?.names ?? '').trim().slice(0, 160),
          prize: String(r?.prize ?? '').trim().slice(0, 80),
        }))
        .filter(r => r.names)
        .slice(0, 10);
    }
    if (body.bannerOn != null) data.banner_on = !!body.bannerOn;

    if (body.id) {
      const before = await this.db.tournaments.findUnique({ where: { id: BigInt(body.id) } });
      if (!before) throw new NotFoundException('Турнир не найден');
      const activeEntries = await this.db.tournament_entries.count({
        where: { tournament_id: before.id, status: { in: ['pending', 'confirmed'] } } });
      if (data.seats != null && data.seats < activeEntries) {
        throw new BadRequestException(`Уже ${activeEntries} заявок — мест не может быть меньше`);
      }
      // Баннер на главной один: включили у этого — у остальных выключаем
      const t = await this.db.$transaction(async tx => {
        if (data.banner_on) await tx.tournaments.updateMany({
          where: { banner_on: true, id: { not: before.id } }, data: { banner_on: false } });
        return tx.tournaments.update({ where: { id: before.id }, data });
      });
      // Корты пересобираем, только если поменялось время, площадки или состояние:
      // правка итогов не должна трогать брони турнира в расписании и истории
      const moved = +before.starts_at !== +t.starts_at || before.hours !== t.hours
        || before.state !== t.state || before.court_ids.join() !== t.court_ids.join();
      const busy = moved ? await this.blockCourts(t) : [];
      // Турнир отменён: заявки снимаем и говорим каждому
      if (t.state === 'cancelled' && before.state !== 'cancelled') {
        const entries = await this.db.tournament_entries.findMany({
          where: { tournament_id: t.id, status: { in: ['pending', 'confirmed'] } } });
        await this.db.tournament_entries.updateMany({
          where: { tournament_id: t.id, status: { in: ['pending', 'confirmed'] } },
          data: { status: 'cancelled', hold_until: null, status_at: new Date(), status_by: 'турнир отменён' } });
        for (const e of entries) {
          await this.notes.toClient(e.client_id, 'tournament', 'Турнир отменён',
            `«${t.name}» не состоится. Если вносили взнос — клуб вернёт, напишите менеджеру.`, { by: req.admin.name });
        }
        await this.auth.log(req.admin, 'отменил турнир', `${t.name}, заявок снято: ${entries.length}`);
      } else if (+before.starts_at !== +t.starts_at && t.state !== 'cancelled') {
        // Время изменилось — участники должны узнать
        const entries = await this.db.tournament_entries.findMany({
          where: { tournament_id: t.id, status: { in: ['pending', 'confirmed'] } } });
        const when = t.starts_at.toLocaleString('ru-RU', {
          day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
        for (const e of entries) {
          await this.notes.toClient(e.client_id, 'tournament', 'Турнир перенесён',
            `«${t.name}» теперь ${when}. Если не сможете — отмените запись в приложении.`, { by: req.admin.name });
        }
      }
      // Сменили загруженную обложку — старый файл больше никому не нужен
      if (data.cover_url !== undefined && before.cover_url !== data.cover_url) await dropUpload(before.cover_url);
      if (data.banner_on !== undefined && data.banner_on !== before.banner_on) {
        await this.auth.log(req.admin, data.banner_on ? 'включил баннер итогов турнира' : 'выключил баннер итогов турнира', t.name);
      }
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
      results: data.results ?? [], banner_on: false,
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
    // Завершённый турнир корты не пересобирает: его брони — это история
    // загрузки кортов, удалять их нельзя
    if (t.state === 'done') return [];
    // Отменённый турнир корты отпускает
    if (t.state === 'cancelled' || !t.court_ids.length) {
      await this.db.bookings.deleteMany({ where: { tournament_id: t.id } });
      return [];
    }
    // Старые брони убираем и ставим новые в одной транзакции: если новое время
    // занято, старые остаются на месте, а не пропадают
    const failed: string[] = [];
    await this.db.$transaction(async tx => {
      await tx.bookings.deleteMany({ where: { tournament_id: t.id } });
      for (const courtId of t.court_ids) {
        try {
          await tx.bookings.create({ data: {
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
      // Ни одну площадку занять не вышло — откатываемся, старые брони остаются
      if (failed.length && failed.length === t.court_ids.length) throw new ConflictException('busy');
    }).catch(e => { if (!(e instanceof ConflictException)) throw e });
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
    /** Аккаунт приложения, выбранный менеджером: бронь идёт на него. */
    clientId?: number;
  }) {
    if (!isValidDate(body.date)) throw new BadRequestException('Дата в виде ГГГГ-ММ-ДД');
    const court = await this.db.courts.findUnique({ where: { id: body.courtId } });
    if (!court) throw new NotFoundException('Площадка не найдена');

    // Часы должны лежать внутри рабочего дня: раньше 23:00 на три часа
    // сохранялось и рисовалось в сетке как «23:00 – 26:00».
    const pricing = await this.club.pricing();
    const set = pricing.settings;
    const hoursCount = Math.trunc(body.hours);
    const dh = hoursOn(set, body.date);
    if (dh.closed) throw new BadRequestException('В этот день клуб не работает — часы меняются в настройках');
    if (!Number.isFinite(body.hour) || body.hour < dh.open || body.hour >= dh.close) {
      throw new BadRequestException(`Час должен быть от ${dh.open} до ${dh.close - 1}`);
    }
    if (hoursCount < 1 || body.hour + hoursCount > dh.close) {
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
    let accountName: string | null = null;
    if (body.clientId) {
      // Человек с приложением: запись на его аккаунт, анкету не трогаем
      const c = await this.db.clients.findUnique({ where: { id: bigId(String(body.clientId)) } });
      if (!c) throw new NotFoundException('Аккаунт не найден');
      clientId = c.id;
      accountName = [c.name, c.surname].filter(Boolean).join(' ') || null;
    } else if (phone) {
      // Без приложения: заводим или находим по номеру. Имя того, у кого уже
      // есть аккаунт с паролем, не переписываем — он сам его задал
      const known = await this.db.clients.findUnique({ where: { phone } });
      const c = known
        ? (known.pass_hash || !name ? known
           : await this.db.clients.update({ where: { id: known.id }, data: { name } }))
        : await this.db.clients.create({ data: { phone, name: name ?? 'Без имени' } });
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
      await this.auth.log(req.admin, 'записал клиента',
        `№${Number(b.id)}: ${accountName ?? name ?? 'без имени'}, ${court.name}, ${whenText(b.starts_at, b.ends_at)}`);
      // Человеку с приложением бронь придёт уведомлением, а не «появится сама»
      if (clientId) {
        const c = await this.db.clients.findUnique({ where: { id: clientId } });
        if (c?.pass_hash) await this.notes.toClient(clientId, 'booking', 'Вас записали',
          `${court.name}, ${whenText(b.starts_at, b.ends_at)}. К оплате ${(price / 100).toLocaleString('ru-RU')} ₽.`,
          { bookingId: b.id, by: req.admin.name });
      }
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
    // «До 25.09» значит до конца 25-го по московскому времени, а не до 03:00
    const until = dto.until
      ? (isValidDate(dto.until) ? clubHour(dto.until, 24) : new Date(dto.until)) : null;
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
    if (!this.auth.can(req.admin, 'clients')) {
      throw new ForbiddenException('Нет доступа: клиенты');
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

  /** Написать клиенту или всем сразу.
   *
   *  Без адресата — рассылка: клуб закрыт на праздник, новые цены, турнир.
   *  С номером — личное сообщение. Отдельного права не требует: писать
   *  клиентам — обычная работа стойки, а журнал сохраняет, кто что отправил. */
  @Post('notify')
  @Needs('clients')
  async notify(@Req() req: any, @Body() body: {
    phone?: string; title?: string; body?: string;
  }) {
    const title = String(body.title ?? '').trim();
    const text = String(body.body ?? '').trim();
    if (title.length < 2) throw new BadRequestException('Нужен заголовок');
    if (text.length < 2) throw new BadRequestException('Нужен текст сообщения');
    if (title.length > 120) throw new BadRequestException('Заголовок не длиннее 120 знаков');
    if (text.length > 1000) throw new BadRequestException('Текст не длиннее 1000 знаков');

    if (body.phone) {
      const key = normalizePhone(body.phone);
      if (!key) throw new BadRequestException('Не разобрал номер телефона');
      const c = await this.db.clients.findUnique({ where: { phone: key } });
      if (!c) throw new NotFoundException('Клиент не найден');
      await this.notes.toClient(c.id, 'manual', title, text, { by: req.admin.name });
      await this.auth.log(req.admin, 'отправил сообщение клиенту', `${c.name}, ${c.phone}`);
      return { ok: true, to: c.name };
    }

    await this.notes.toEveryone('manual', title, text, req.admin.name);
    await this.auth.log(req.admin, 'отправил сообщение всем', title);
    return { ok: true, to: 'всем' };
  }

  /** Что уже отправляли. */
  @Get('notifications')
  @Needs('clients')
  async sentNotifications() {
    const rows = await this.db.notifications.findMany({
      orderBy: { created_at: 'desc' }, take: 60, include: { clients: true },
    });
    return rows.map(n => ({
      id: Number(n.id), kind: n.kind, title: n.title, body: n.body,
      createdAt: n.created_at, createdBy: n.created_by,
      to: n.clients ? { name: n.clients.name, phone: n.clients.phone } : null,
      read: n.client_id != null ? n.read_at != null : null,
    }));
  }

  /** Все клиенты: кто записывался и кто завёл аккаунт.
   *  Поиск по имени, фамилии или части номера — как ищут у стойки. */
  /** Написать сразу нескольким клиентам — выбранным на странице «Клиенты». */
  @Post('notify-many')
  @Needs('clients')
  async notifyMany(@Req() req: any, @Body() body: { clientIds?: number[]; title?: string; body?: string }) {
    const title = String(body.title ?? '').trim();
    const text = String(body.body ?? '').trim();
    if (title.length < 2) throw new BadRequestException('Нужен заголовок');
    if (text.length < 2) throw new BadRequestException('Нужен текст сообщения');
    if (title.length > 120) throw new BadRequestException('Заголовок не длиннее 120 знаков');
    if (text.length > 1000) throw new BadRequestException('Текст не длиннее 1000 знаков');
    const ids = [...new Set((Array.isArray(body.clientIds) ? body.clientIds : [])
      .map(Number).filter(n => Number.isInteger(n) && n > 0))];
    if (!ids.length) throw new BadRequestException('Никто не выбран');
    if (ids.length > 5000) throw new BadRequestException('Не больше 5000 получателей за раз');
    const found = await this.db.clients.findMany({
      where: { id: { in: ids.map(n => BigInt(n)) } }, select: { id: true } });
    await this.db.notifications.createMany({ data: found.map(c => ({
      client_id: c.id, kind: 'manual', title, body: text, created_by: req.admin.name,
    })) });
    await this.auth.log(req.admin, 'отправил сообщение клиентам', `${found.length} чел.: ${title}`);
    return { ok: true, sent: found.length };
  }

  /** Все клиенты со сводкой — для страницы «Клиенты»: фильтры, сортировка
   *  и выбор получателей делаются в админке, клиентов у клуба тысячи, не миллионы. */
  @Get('clients')
  @Needs('clients')
  async clientsList(@Query('q') q?: string) {
    const text = String(q ?? '').trim();
    const digits = searchDigits(text);
    const accountId = accountIdOf(text);
    const where: any = accountId != null ? { id: accountId } : text ? { OR: [
      { name: { contains: text, mode: 'insensitive' } },
      { surname: { contains: text, mode: 'insensitive' } },
      // Номер ищем по цифрам: «299-99-72», «2999972» и «+7 (928) 299 99 72»
      // находят одного и того же человека. Хватает двух цифр — хвоста номера.
      ...(digits.length >= 2
        ? [{ phone: { contains: digits } }, { whatsapp: { contains: digits } }] : []),
    ] } : {};
    const rows = await this.db.clients.findMany({ where, orderBy: { created_at: 'desc' }, take: 5000 });
    const inIds = { in: rows.map(r => r.id) };
    const [real, played, entries] = await Promise.all([
      this.db.bookings.groupBy({
        by: ['client_id'], where: { client_id: inIds, status: { in: ['confirmed', 'done'] }, starts_at: { lt: new Date() } },
        _count: { _all: true },
      }),
      this.db.bookings.groupBy({
        by: ['client_id'], where: { client_id: inIds, status: { in: ['confirmed', 'done'] }, starts_at: { lt: new Date() } },
        _sum: { price: true, discount: true }, _max: { starts_at: true },
      }),
      this.db.tournament_entries.groupBy({
        by: ['client_id'], where: { client_id: inIds, status: 'confirmed' }, _count: { _all: true },
      }),
    ]);
    const cnt = new Map(real.map(x => [String(x.client_id), x._count._all]));
    const pl = new Map(played.map(x => [String(x.client_id), x]));
    const tn = new Map(entries.map(x => [String(x.client_id), x._count._all]));
    return rows.map(c => {
      const p = pl.get(String(c.id));
      return {
        id: Number(c.id), name: c.name, surname: c.surname, phone: c.phone,
        whatsapp: c.whatsapp, hasPassword: !!c.pass_hash, since: c.created_at,
        bookings: cnt.get(String(c.id)) ?? 0,
        spent: (p?._sum.price ?? 0) - (p?._sum.discount ?? 0),
        lastAt: p?._max.starts_at ?? null,
        tournaments: tn.get(String(c.id)) ?? 0,
        cancels: c.cancels, noShows: c.no_shows,
      };
    });
  }

  // Без отдельного права: история клиента нужна в карточке брони любому на стойке
  @Get('clients/:phone')
  async client(@Param('phone') phone: string) {
    const c = await this.db.clients.findUnique({ where: { phone: normalizePhone(phone) ?? phone } });
    if (!c) throw new NotFoundException('Клиент не найден');
    // Вся история, а не последние 50: карточка клиента — отдельная страница
    // с прокруткой, и длинная история там уместна
    const rows = await this.db.bookings.findMany({
      where: { client_id: c.id }, orderBy: { starts_at: 'desc' }, take: 2000,
    });
    const courts = new Map((await this.db.courts.findMany()).map(x => [x.id, x.name]));
    const entries = await this.db.tournament_entries.findMany({
      where: { client_id: c.id }, orderBy: { created_at: 'desc' }, include: { tournaments: true }, take: 200,
    });
    return {
      id: Number(c.id), name: [c.name, c.surname].filter(Boolean).join(' '),
      phone: c.phone, whatsapp: c.whatsapp, hasPassword: !!c.pass_hash,
      cancels: c.cancels, noShows: c.no_shows, note: c.note,
      since: c.created_at,
      history: await (async () => {
        const extrasBy = await this.extrasOf(rows.map(r => r.id));
        const paid = rows.length ? await this.db.payments.groupBy({
          by: ['booking_id'], where: { booking_id: { in: rows.map(r => r.id) } }, _sum: { amount: true } }) : [];
        const paidBy = new Map(paid.map(x => [String(x.booking_id), x._sum.amount ?? 0]));
        return rows.map(b => ({
          id: Number(b.id), courtId: b.court_id, courtName: courts.get(b.court_id) ?? b.court_id,
          startsAt: b.starts_at, hours: Math.round((+b.ends_at - +b.starts_at) / 3600_000),
          price: b.price, discount: b.discount, extras: extrasBy.get(String(b.id))?.sum ?? 0,
          due: Math.max(0, b.price - b.discount) + (extrasBy.get(String(b.id))?.sum ?? 0),
          paid: paidBy.get(String(b.id)) ?? 0, status: b.status, keptPrepay: b.kept_prepay,
          tournamentId: b.tournament_id ? Number(b.tournament_id) : null, source: b.source,
        }));
      })(),
      tournaments: entries.map(e => ({
        id: Number(e.tournament_id), name: e.tournaments.name, startsAt: e.tournaments.starts_at,
        status: e.status, fee: e.tournaments.fee,
      })),
      // Что покупал: прокат, мячи, товары — и к броням, и просто так
      purchases: (await this.db.sales.findMany({
        where: { client_id: c.id }, orderBy: { id: 'desc' }, take: 1000 }))
        .map(x => ({ id: Number(x.id), day: x.day.toISOString().slice(0, 10),
          item: x.item ?? SALE_WORD[x.category] ?? x.category, qty: x.qty, amount: x.amount,
          bookingId: x.booking_id ? Number(x.booking_id) : null })),
    };
  }
}

/** Номер для звонка и WhatsApp: только цифры, 10–15 знаков. Пусто — убрать.
 *  Проверяем, потому что кривой номер ломает и ссылку wa.me, и набор. */
function phoneOrNull(v: string): string | null {
  const raw = String(v ?? '').trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    throw new BadRequestException('Номер должен состоять из 10–15 цифр');
  }
  // Восьмёрку приводим к семёрке: wa.me понимает только международный вид
  return digits.length === 11 && digits[0] === '8' ? '7' + digits.slice(1) : digits;
}

/** Ссылка. Пусто — убрать. Только http(s), иначе можно подсунуть что угодно. */
/** Telegram можно вписать как угодно: «@имя», «имя», «t.me/имя»
 *  или полной ссылкой. Храним всегда https://t.me/имя. */
function telegramOrNull(v: string): string | null {
  const raw = String(v ?? '').trim();
  if (!raw) return null;
  const m = raw.match(/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/(\+?[\w-]{3,64})\/?$/i)
    ?? raw.match(/^@?([A-Za-z][\w]{3,31})$/);
  if (!m) throw new BadRequestException('Telegram: впишите @имя или ссылку https://t.me/имя');
  return `https://t.me/${m[1]}`;
}

function linkOrNull(v: string): string | null {
  const raw = String(v ?? '').trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) throw new BadRequestException('Ссылка должна начинаться с https://');
  if (raw.length > 500) throw new BadRequestException('Ссылка слишком длинная');
  return raw;
}

/** «12 сентября, 19:00 – 20:00» — по времени клуба, а не по UTC. */
function whenText(from: Date, to: Date): string {
  const f = (d: Date) => d.toLocaleTimeString('ru-RU',
    { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
  const day = from.toLocaleDateString('ru-RU',
    { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });
  return `${day}, ${f(from)} – ${f(to)}`;
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
/** 'bill' — не способ оплаты, а «в счёт брони»: платят вместе с кортом. */
// Штрафов у клуба нет: при неявке удерживается уже внесённая предоплата
// (флаг kept_prepay у брони), новых денег это не создаёт.
export const PAY_KINDS = ['payment', 'refund'];

const PAY_WORD: Record<string, string> = {
  cash: 'наличными', card: 'картой', sbp: 'по СБП',
  transfer: 'переводом', invoice: 'по счёту',
};

const KIND_WORD: Record<string, string> = {
  payment: 'принял оплату', refund: 'вернул деньги',
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
