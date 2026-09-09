// Ящик уведомлений в приложении.
//
// Доступ по тем же правилам, что и записи: сначала токен входа, а без него —
// по номеру, но только если на аккаунте не задан пароль.
import { Controller, Get, Headers, Post, Query, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClientAuthService } from '../clients/client-auth.service';
import { NotificationsService } from './notifications.service';
import { normalizePhone } from '../phone';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly db: PrismaService,
    private readonly auth: ClientAuthService,
    private readonly notes: NotificationsService,
  ) {}

  private async whose(header: string | undefined, phone: string | undefined) {
    const byToken = await this.auth.whoIs(this.auth.tokenOf(header));
    if (byToken) return byToken;
    const key = normalizePhone(phone);
    if (!key) throw new UnauthorizedException('Нужно войти в аккаунт');
    const c = await this.db.clients.findUnique({ where: { phone: key } });
    if (!c) return null;
    if (c.pass_hash) throw new UnauthorizedException('Этот номер защищён паролем — войдите в аккаунт');
    return c;
  }

  @Get()
  async list(@Query('phone') phone?: string, @Headers('authorization') header?: string) {
    const c = await this.whose(header, phone);
    if (!c) return { items: [], unread: 0 };
    return this.notes.listFor(c.id);
  }

  @Post('read')
  async read(@Query('phone') phone?: string, @Headers('authorization') header?: string) {
    const c = await this.whose(header, phone);
    if (c) await this.notes.markRead(c.id);
    return { ok: true };
  }
}
