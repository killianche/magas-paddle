import {
  BadRequestException, Body, Controller, Get, NotFoundException,
  Param, Post, Query, UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AdminGuard } from './admin.guard';
import { clubHour, clubToday, hourOf, isValidDate } from '../time';
import { CLOSE_HOUR, MORNING_UNTIL, OPEN_HOUR } from '../club';
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

@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly db: PrismaService) {}

  /** День менеджера: все заявки и брони на дату, по времени. */
  @Get('day')
  async day(@Query('date') date?: string) {
    const d = date || clubToday();
    if (!isValidDate(d)) throw new BadRequestException('Дата в виде ГГГГ-ММ-ДД');

    const rows = await this.db.bookings.findMany({
      where: { starts_at: { gte: clubHour(d, 0), lt: clubHour(d, 24) } },
      orderBy: [{ starts_at: 'asc' }, { court_id: 'asc' }],
    });
    const [courts, clients] = await Promise.all([
      this.db.courts.findMany({ orderBy: { sort_order: 'asc' } }),
      this.db.clients.findMany({ where: { id: { in: rows.map(r => r.client_id!).filter(Boolean) } } }),
    ]);
    const byId = new Map(clients.map(c => [String(c.id), c]));

    return {
      date: d,
      openHour: OPEN_HOUR,
      closeHour: CLOSE_HOUR,
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
          client: cl ? {
            id: Number(cl.id), name: cl.name, phone: cl.phone,
            cancels: cl.cancels, noShows: cl.no_shows, note: cl.note,
          } : null,
        };
      }),
    };
  }

  /** Подтвердить, отменить или отметить, что не пришёл. */
  @Post('bookings/:id/status')
  async setStatus(@Param('id') id: string, @Body() dto: StatusDto) {
    const b = await this.db.bookings.findUnique({ where: { id: BigInt(id) } });
    if (!b) throw new NotFoundException('Запись не найдена');

    const ops: any[] = [
      this.db.bookings.update({ where: { id: b.id }, data: { status: dto.status } }),
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
    return { id: Number(b.id), status: dto.status };
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

    const hoursCount = Math.trunc(
      body.hours ?? Math.round((+b.ends_at - +b.starts_at) / 3600_000));
    if (body.hour < OPEN_HOUR || hoursCount < 1 || body.hour + hoursCount > CLOSE_HOUR) {
      throw new BadRequestException('Время не помещается в рабочий день');
    }

    let price = 0;
    for (let h = body.hour; h < body.hour + hoursCount; h++) {
      price += h < MORNING_UNTIL ? court.price_morning : court.price_standard;
    }

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

  /** Дата брони в часовом поясе клуба, в виде ГГГГ-ММ-ДД. */
  private dateOf(d: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d);
  }

  /** Занять время вручную: пришли без приложения, позвонили, турнир. */
  @Post('bookings')
  async createManual(@Body() body: {
    courtId: string; date: string; hour: number; hours: number;
    name?: string; phone?: string; comment?: string;
  }) {
    if (!isValidDate(body.date)) throw new BadRequestException('Дата в виде ГГГГ-ММ-ДД');
    const court = await this.db.courts.findUnique({ where: { id: body.courtId } });
    if (!court) throw new NotFoundException('Площадка не найдена');

    // Часы должны лежать внутри рабочего дня: раньше 23:00 на три часа
    // сохранялось и рисовалось в сетке как «23:00 – 26:00».
    const hoursCount = Math.trunc(body.hours);
    if (!Number.isFinite(body.hour) || body.hour < OPEN_HOUR || body.hour >= CLOSE_HOUR) {
      throw new BadRequestException(`Час должен быть от ${OPEN_HOUR} до ${CLOSE_HOUR - 1}`);
    }
    if (hoursCount < 1 || body.hour + hoursCount > CLOSE_HOUR) {
      throw new BadRequestException('Игра не помещается до закрытия клуба');
    }

    // Закрытая площадка не должна принимать записи и через админку тоже
    if (court.closed_until && court.closed_until > new Date()) {
      throw new BadRequestException(court.closed_reason ?? 'Площадка закрыта');
    }

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

    let price = 0;
    for (let h = body.hour; h < body.hour + hoursCount; h++) {
      price += h < MORNING_UNTIL ? court.price_morning : court.price_standard;
    }

    try {
      const b = await this.db.bookings.create({ data: {
        court_id: court.id, client_id: clientId,
        starts_at: clubHour(body.date, body.hour),
        ends_at: clubHour(body.date, body.hour + hoursCount),
        price, status: 'confirmed', source: 'admin', comment: body.comment,
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
  @Get('clients/:phone')
  async client(@Param('phone') phone: string) {
    const c = await this.db.clients.findUnique({ where: { phone } });
    if (!c) throw new NotFoundException('Клиент не найден');
    const rows = await this.db.bookings.findMany({
      where: { client_id: c.id }, orderBy: { starts_at: 'desc' }, take: 50,
    });
    const courts = new Map((await this.db.courts.findMany()).map(x => [x.id, x.name]));
    return {
      id: Number(c.id), name: c.name, phone: c.phone,
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
