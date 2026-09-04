import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

/**
 * Вход в админку по общему ключу персонала.
 *
 * ВРЕМЕННОЕ РЕШЕНИЕ: у клуба один-два сотрудника, отдельные учётные записи
 * пока избыточны. Когда появятся смены и потребуется видеть, кто что сделал,
 * это заменяется на нормальный вход — см. задачу 1.5 в docs/TASKS.md.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const key = process.env.ADMIN_KEY;
    if (!key) throw new UnauthorizedException('Админка не настроена');
    const req = ctx.switchToHttp().getRequest();
    const given = req.headers['x-admin-key'] ?? req.query?.key;
    if (given !== key) throw new UnauthorizedException('Неверный ключ');
    return true;
  }
}
