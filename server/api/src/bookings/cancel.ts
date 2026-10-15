/** Отмена брони самим человеком — одна процедура для кнопки «Отменить»
 *  в приложении и для удаления аккаунта.
 *
 *  Раньше удаление аккаунта снимало брони одним updateMany в обход этой
 *  логики: мячи из приложения не возвращались на склад, строки счёта
 *  оставались, правило поздней отмены не применялось (аудит 15.10.2026).
 *
 *  Статус меняем только из «ждёт» или «подтверждена». Это защита от двойной
 *  отмены: раньше статус читали, а меняли без условия, и две одновременные
 *  отмены (человек и менеджер, человек и сгорание заявки) дважды возвращали
 *  товар на склад. Теперь вторая получает false и ничего не трогает. */
import type { Prisma } from '@prisma/client';

/** Строки счёта, заказанные в приложении: при отмене их убираем. Проданное
 *  на стойке не трогаем — это уже выпитая вода, выручка клуба. */
export const IN_APP = { method: 'bill', admin_name: 'приложение' } as const;

export async function cancelByClient(
  tx: Prisma.TransactionClient,
  booking: { id: bigint; client_id: bigint | null },
  opts: { statusBy: string; keptPrepay: boolean; countCancel: boolean; note: string },
): Promise<boolean> {
  const r = await tx.bookings.updateMany({
    where: { id: booking.id, status: { in: ['pending', 'confirmed'] } },
    data: { status: 'cancelled', status_at: new Date(), status_by: opts.statusBy, kept_prepay: opts.keptPrepay },
  });
  if (r.count !== 1) return false;

  // Счётчик отмен — только за подтверждённую бронь: отказ от своей же
  // неподтверждённой заявки человеку не в укор
  if (opts.countCancel && booking.client_id) {
    await tx.clients.update({ where: { id: booking.client_id }, data: { cancels: { increment: 1 } } });
  }

  // Ракетки и мячи из приложения человек не брал — товар возвращаем
  const lines = await tx.sales.findMany({
    where: { booking_id: booking.id, ...IN_APP, product_id: { not: null } }, include: { products: true } });
  for (const l of lines) {
    const pr = l.products;
    if (!pr || pr.category === 'rental' || pr.stock == null) continue;
    const after = await tx.products.update({
      where: { id: pr.id }, data: { stock: { increment: l.qty } }, select: { stock: true } });
    await tx.stock_moves.create({ data: {
      product_id: pr.id, kind: 'return', qty: l.qty, stock_after: after.stock,
      note: opts.note, admin_name: 'приложение',
    }});
  }
  await tx.sales.deleteMany({ where: { booking_id: booking.id, ...IN_APP } });
  return true;
}
