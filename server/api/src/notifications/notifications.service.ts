/** Уведомления клиентам.
 *
 *  Пока это ящик внутри приложения, а не пуш на экран телефона: пушам нужен
 *  сертификат APNs и согласие человека, а текст и место, куда сообщения
 *  приходят, нужны уже сейчас. Когда пуши подключат, отправка добавится сюда
 *  же — экраны и хранение менять не придётся.
 *
 *  Сообщение без клиента — рассылка всем. Отметку о прочтении рассылки держим
 *  отдельной таблицей: у неё нет одного владельца.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type NotifyKind = 'manual' | 'booking' | 'tournament';

@Injectable()
export class NotificationsService {
  constructor(private readonly db: PrismaService) {}

  /** Написать одному человеку. */
  async toClient(clientId: bigint, kind: NotifyKind, title: string, body: string,
                 opts: { bookingId?: bigint; by?: string } = {}) {
    return this.db.notifications.create({
      data: {
        client_id: clientId, kind, title, body,
        booking_id: opts.bookingId ?? null, created_by: opts.by ?? null,
      },
    });
  }

  /** Написать всем сразу. */
  async toEveryone(kind: NotifyKind, title: string, body: string, by?: string) {
    return this.db.notifications.create({
      data: { client_id: null, kind, title, body, created_by: by ?? null },
    });
  }

  /** Что человек ещё не прочитал: личные и общие. */
  async listFor(clientId: bigint, limit = 50) {
    const [mine, all, reads] = await Promise.all([
      this.db.notifications.findMany({
        where: { client_id: clientId }, orderBy: { created_at: 'desc' }, take: limit,
      }),
      this.db.notifications.findMany({
        where: { client_id: null }, orderBy: { created_at: 'desc' }, take: limit,
      }),
      this.db.notification_reads.findMany({ where: { client_id: clientId } }),
    ]);
    const readIds = new Set(reads.map(r => String(r.notification_id)));

    const rows = [...mine, ...all]
      .sort((a, b) => +b.created_at - +a.created_at)
      .slice(0, limit)
      .map(n => ({
        id: Number(n.id),
        kind: n.kind,
        title: n.title,
        body: n.body,
        createdAt: n.created_at,
        forEveryone: n.client_id == null,
        read: n.client_id == null ? readIds.has(String(n.id)) : n.read_at != null,
      }));

    return { items: rows, unread: rows.filter(r => !r.read).length };
  }

  /** Пометить прочитанным всё, что человек видит. */
  async markRead(clientId: bigint) {
    const now = new Date();
    const all = await this.db.notifications.findMany({
      where: { client_id: null }, select: { id: true },
    });
    await this.db.$transaction([
      this.db.notifications.updateMany({
        where: { client_id: clientId, read_at: null }, data: { read_at: now },
      }),
      ...all.map(n => this.db.notification_reads.upsert({
        where: {
          notification_id_client_id: { notification_id: n.id, client_id: clientId },
        },
        update: {},
        create: { notification_id: n.id, client_id: clientId, read_at: now },
      })),
    ]);
  }
}
