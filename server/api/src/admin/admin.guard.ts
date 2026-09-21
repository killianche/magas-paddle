import {
  CanActivate, ExecutionContext, Injectable, SetMetadata,
  ForbiddenException, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService, PERMS, type Perm } from './auth.service';

/** Право, нужное для метода. Без него достаточно просто входа:
 *  смотреть день и записывать клиентов может любой сотрудник. */
export const NEEDS = 'needs_perm';
export const Needs = (perm: Perm) => SetMetadata(NEEDS, perm);

/** Метод, открытый входу тренера.
 *
 *  У тренера отдельный вход и отдельный кабинет: свой график записей,
 *  своя история тренировок и свой заработок. Всё остальное в админке —
 *  сетка клуба, клиенты, касса, деньги — ему не показывается и не отдаётся
 *  сервером, даже если запрос отправить напрямую. */
export const COACH_OK = 'coach_ok';
export const CoachOk = () => SetMetadata(COACH_OK, true);

/**
 * Вход в админку по личной учётной записи.
 *
 * Раньше здесь был один общий ключ на всех сотрудников: узнать, кто отменил
 * бронь или поднял цену, было нельзя. Теперь у каждого свой вход, права
 * выдаёт владелец клуба, а действия пишутся в журнал.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header = String(req.headers['authorization'] ?? '');
    const token = header.startsWith('Bearer ')
      ? header.slice(7)
      : (req.headers['x-admin-token'] as string | undefined);

    const admin = await this.auth.whoIs(token);
    if (!admin) throw new UnauthorizedException('Нужно войти заново');
    req.admin = admin;

    if (admin.role === 'coach') {
      const allowed = this.reflector.getAllAndOverride<boolean | undefined>(
        COACH_OK, [ctx.getHandler(), ctx.getClass()]);
      if (!allowed) throw new ForbiddenException('Этот раздел тренеру не открыт');
    }

    const perm = this.reflector.getAllAndOverride<Perm | undefined>(
      NEEDS, [ctx.getHandler(), ctx.getClass()]);
    if (perm && !this.auth.can(admin, perm)) {
      throw new ForbiddenException(`Нет доступа: ${PERMS[perm].toLowerCase()}`);
    }
    return true;
  }
}
