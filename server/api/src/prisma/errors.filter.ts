/** Ошибки базы, которые на самом деле — ответ человеку, а не сбой сервера.
 *
 *  Удаление или правка записи, которой уже нет (её убрал другой менеджер,
 *  открыта старая вкладка), падали в Prisma с P2025 и уходили наружу как
 *  500 «Internal server error»: админка показывала «Ошибка 500», и было
 *  непонятно, сломался ли сервер. То же с P2002 — повтор уникального
 *  значения при одновременных запросах. Остальные ошибки идут прежним
 *  путём, как и раньше. */
import { ArgumentsHost, Catch } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaErrorsFilter extends BaseExceptionFilter {
  catch(e: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const answer = e.code === 'P2025' ? { status: 404, message: 'Запись не найдена — обновите экран' }
      : e.code === 'P2002' ? { status: 409, message: 'Такая запись уже есть — обновите экран' }
      : null;
    if (!answer) return super.catch(e, host);
    const res = host.switchToHttp().getResponse();
    res.status(answer.status).json({ statusCode: answer.status, message: answer.message });
  }
}
