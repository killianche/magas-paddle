import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get,
  Headers, NotFoundException, Param, Post, Query,
} from '@nestjs/common';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../phone';
import { ClientAuthService } from '../clients/client-auth.service';
import { ClubService } from '../club';

class EnterDto {
  @IsString() @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(80) surname?: string;
  @Matches(/^[\d\s()+-]{10,20}$/, { message: 'Телефон должен состоять из 10–15 цифр' }) phone: string;
}

/** Заявка занимает место, пока её не отменили и не истёк срок удержания. */
export const ACTIVE_ENTRY = { status: { in: ['pending', 'confirmed'] } };

/** Кем отмечено изменение, если не клубом. */
const SELF = ['приложение', 'сам в приложении', 'срок вышел'];

@Controller('tournaments')
export class TournamentsController {
  constructor(
    private readonly db: PrismaService,
    private readonly auth: ClientAuthService,
    private readonly club: ClubService,
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
    // Просроченные заявки не должны занимать места и значиться «ждёт»
    await this.club.releaseExpired();
    const rows = await this.db.tournaments.findMany({ orderBy: { starts_at: 'asc' } });
    const counts = await this.db.tournament_entries.groupBy({
      by: ['tournament_id'], where: ACTIVE_ENTRY, _count: { _all: true },
    });
    const taken = new Map(counts.map(c => [String(c.tournament_id), c._count._all]));

    // Своя заявка: номер, состояние и срок удержания — как у брони корта
    const mine = new Map<string, { id: number; status: string; holdUntil: Date | null; byClub: boolean }>();
    const client = await this.whose(header, phone);
    if (client) {
      const e = await this.db.tournament_entries.findMany({ where: { client_id: client.id } });
      for (const x of e) mine.set(String(x.tournament_id), {
        id: Number(x.id), status: x.status, holdUntil: x.hold_until,
        // Отменил не сам человек, а клуб — в приложении это «заявка отклонена»
        byClub: x.status === 'cancelled' && !SELF.includes(x.status_by ?? ''),
      });
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
      // Итоги: призовые места и фото; bannerOn — показать баннер на главной
      results: t.results, photos: t.result_photos, bannerOn: t.banner_on,
      // Записан — заявка ждёт подтверждения или уже подтверждена
      entered: ['pending', 'confirmed'].includes(mine.get(String(t.id))?.status ?? ''),
      entry: mine.get(String(t.id)) ?? null,
    }));
  }

  /** Заявка на турнир из приложения: человек заполняет форму, заявка ждёт
   *  подтверждения администратора и держит место. WhatsApp не нужен, поэтому
   *  короткого удержания, как у брони корта, нет: заявка ждёт решения до
   *  начала турнира. Ответ клуба приходит в уведомления приложения. */
  @Post(':id/entries')
  async enter(@Param('id') id: string, @Body() dto: EnterDto) {
    const entryPhone = normalizePhone(dto.phone);
    if (!entryPhone) throw new BadRequestException('Номер телефона неполный');

    await this.club.releaseExpired();
    const t = await this.db.tournaments.findUnique({ where: { id: BigInt(id) } });
    if (!t) throw new NotFoundException('Турнир не найден');
    if (t.state !== 'open') throw new ConflictException('Запись на этот турнир закрыта');
    if (t.starts_at < new Date()) throw new ConflictException('Турнир уже начался');

    const count = await this.db.tournament_entries.count({
      where: { tournament_id: t.id, ...ACTIVE_ENTRY } });
    if (count >= t.seats) throw new ConflictException('Мест больше нет');

    // Чужую анкету заявка не переписывает — как у брони корта
    const surname = dto.surname?.trim() || null;
    const known = await this.db.clients.findUnique({ where: { phone: entryPhone } });
    const client = known?.pass_hash ? known : await this.db.clients.upsert({
      where: { phone: entryPhone },
      update: { name: dto.name, ...(surname ? { surname } : {}) },
      create: { phone: entryPhone, name: dto.name, surname },
    });

    const holdUntil = t.starts_at;

    // Один человек — одна запись на турнир. Отменённую или истёкшую
    // заявку можно подать снова: оживляем ту же строку.
    const prev = await this.db.tournament_entries.findUnique({
      where: { tournament_id_client_id: { tournament_id: t.id, client_id: client.id } } });
    if (prev && ['pending', 'confirmed'].includes(prev.status)) {
      throw new ConflictException(prev.status === 'confirmed'
        ? 'Вы уже записаны на этот турнир' : 'Ваша заявка на этот турнир уже ждёт подтверждения');
    }
    const data = { status: 'pending', hold_until: holdUntil, status_at: new Date(), status_by: 'приложение' };
    const e = prev
      ? await this.db.tournament_entries.update({ where: { id: prev.id }, data })
      : await this.db.tournament_entries.create({ data: { tournament_id: t.id, client_id: client.id, ...data } });

    return {
      id: Number(e.id), tournamentId: Number(t.id), tournamentName: t.name,
      startsAt: t.starts_at, fee: t.fee, status: e.status,
      holdUntil: e.hold_until,
      // ID аккаунта приложение запоминает в профиле
      clientId: Number(client.id),
      entered: true, left: t.seats - count - 1,
    };
  }

  @Delete(':id/entries')
  async leave(@Param('id') id: string, @Query('phone') phone?: string,
              @Headers('authorization') header?: string) {
    const client = await this.whose(header, phone);
    if (!client) throw new NotFoundException('Запись не найдена');
    // Строку не удаляем, а отмечаем отменённой: заявку можно подать снова,
    // а у менеджера остаётся след, кто передумал
    const res = await this.db.tournament_entries.updateMany({
      where: { tournament_id: BigInt(id), client_id: client.id, ...ACTIVE_ENTRY },
      data: { status: 'cancelled', hold_until: null, status_at: new Date(), status_by: 'сам в приложении' },
    });
    if (res.count === 0) throw new NotFoundException('Запись не найдена');
    return { tournamentId: Number(id), entered: false };
  }
}
