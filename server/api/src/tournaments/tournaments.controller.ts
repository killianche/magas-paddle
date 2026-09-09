import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get,
  Headers, NotFoundException, Param, Post, Query,
} from '@nestjs/common';
import { IsString, Matches, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../phone';
import { ClientAuthService } from '../clients/client-auth.service';

class EnterDto {
  @IsString() @MaxLength(80) name: string;
  @Matches(/^\+?\d{10,15}$/, { message: 'Телефон должен состоять из 10–15 цифр' }) phone: string;
}

@Controller('tournaments')
export class TournamentsController {
  constructor(
    private readonly db: PrismaService,
    private readonly auth: ClientAuthService,
  ) {}

  /** Кто спрашивает: по токену входа, а без него — по номеру, но только
   *  если аккаунт не защищён паролем. Та же логика, что и у записей. */
  private async whose(header: string | undefined, phone: string | undefined) {
    const byToken = await this.auth.whoIs(this.auth.tokenOf(header));
    if (byToken) return byToken;
    const key = normalizePhone(phone);
    if (!key) return null;
    const c = await this.db.clients.findUnique({ where: { phone: key } });
    return c && !c.pass_hash ? c : null;
  }

  @Get()
  async list(@Query('phone') phone?: string, @Headers('authorization') header?: string) {
    const rows = await this.db.tournaments.findMany({ orderBy: { starts_at: 'asc' } });
    const counts = await this.db.tournament_entries.groupBy({
      by: ['tournament_id'], _count: { _all: true },
    });
    const taken = new Map(counts.map(c => [String(c.tournament_id), c._count._all]));

    let mine = new Set<string>();
    const client = await this.whose(header, phone);
    if (client) {
      const e = await this.db.tournament_entries.findMany({
        where: { client_id: client.id }, select: { tournament_id: true },
      });
      mine = new Set(e.map(x => String(x.tournament_id)));
    }

    return rows.map(t => ({
      id: Number(t.id),
      name: t.name,
      startsAt: t.starts_at,
      format: t.format,
      fee: t.fee,
      hours: t.hours,
      courts: t.court_ids.length,
      seats: t.seats,
      taken: taken.get(String(t.id)) ?? 0,
      state: t.state,
      coverUrl: t.cover_url,
      result: t.result_text,
      entered: mine.has(String(t.id)),
    }));
  }

  @Post(':id/entries')
  async enter(@Param('id') id: string, @Body() dto: EnterDto) {
    const entryPhone = normalizePhone(dto.phone);
    if (!entryPhone) throw new BadRequestException('Номер телефона неполный');

    const t = await this.db.tournaments.findUnique({ where: { id: BigInt(id) } });
    if (!t) throw new NotFoundException('Турнир не найден');
    if (t.state !== 'open') throw new ConflictException('Запись на этот турнир закрыта');

    const count = await this.db.tournament_entries.count({ where: { tournament_id: t.id } });
    if (count >= t.seats) throw new ConflictException('Мест больше нет');

    const client = await this.db.clients.upsert({
      where: { phone: entryPhone },
      update: { name: dto.name },
      create: { phone: entryPhone, name: dto.name },
    });

    try {
      await this.db.tournament_entries.create({
        data: { tournament_id: t.id, client_id: client.id },
      });
    } catch (e: any) {
      // Один человек — одна запись, это ограничение в базе
      if (e?.code === 'P2002') throw new ConflictException('Вы уже записаны на этот турнир');
      throw e;
    }
    return { tournamentId: Number(t.id), entered: true, left: t.seats - count - 1 };
  }

  @Delete(':id/entries')
  async leave(@Param('id') id: string, @Query('phone') phone?: string,
              @Headers('authorization') header?: string) {
    const client = await this.whose(header, phone);
    if (!client) throw new NotFoundException('Запись не найдена');
    const res = await this.db.tournament_entries.deleteMany({
      where: { tournament_id: BigInt(id), client_id: client.id },
    });
    if (res.count === 0) throw new NotFoundException('Запись не найдена');
    return { tournamentId: Number(id), entered: false };
  }
}
