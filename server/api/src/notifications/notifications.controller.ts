// Ящик уведомлений в приложении.
//
// Доступ только по входу в аккаунт: по одному номеру телефона чужие
// уведомления посмотреть нельзя.
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

  private async whose(header: string | undefined, _phone?: string) {
    return this.auth.whoIs(this.auth.tokenOf(header));
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
