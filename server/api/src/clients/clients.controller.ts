// Аккаунт игрока: регистрация, вход, анкета.
//
// Пароль появился, чтобы закрыть простую дыру: раньше приложение узнавало
// человека по одному номеру телефона, и тот, кто знал чужой номер, видел имя
// и историю посещений. Теперь личные данные отдаются только по токену входа.
//
// Совместимость. У аккаунтов, где пароль ещё не задан, старый порядок «по
// номеру» продолжает работать — иначе версии приложения, уже разосланные
// тестировщикам, перестали бы показывать записи. Как только человек задал
// пароль, доступ по одному номеру для него закрывается.
//
// Вход начинается с номера (решение заказчика 08.10.2026): человек вводит
// номер, и приложение спрашивает сервер, знаком ли он. Знаком — просим пароль;
// нет — подтверждаем номер обратным звонком и заводим аккаунт.
//
// Восстановление пароля: через менеджера. Он и так разговаривает с человеком
// по телефону и может сбросить пароль из админки.
import {
  BadRequestException, Body, ConflictException, Controller, Get, Headers,
  ForbiddenException, HttpException, Post, Query, Req, UnauthorizedException,
} from '@nestjs/common';
import { ipOf, limitRate } from '../ratelimit';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../phone';
import { ClientAuthService, checkClientPassword } from './client-auth.service';
import { ClubService } from '../club';
import { CallChecks, SmsRuCallCheck, LIMIT_TEXT, type CallCheckProvider } from './callcheck';

/** Подтверждение номера звонком. Ключа нет — способ выключен, и служба
 *  честно отвечает, что он недоступен. */
const SMSRU_KEY = (process.env.SMSRU_API_ID ?? '').trim();
const callProvider: CallCheckProvider | null = SMSRU_KEY ? new SmsRuCallCheck(SMSRU_KEY) : null;
const calls = new CallChecks();

/** Подтверждаем только мобильные России: на городской номер не позвонить. */
const RU_MOBILE = /^79\d{9}$/;

export class RegisterDto {
  @IsString() @MaxLength(80)
  name: string;

  /** Подтверждение номера звонком, выданное /clients/call/status. */
  @IsOptional() @IsString() @MaxLength(80)
  verificationToken?: string;

  @IsOptional() @IsString() @MaxLength(80)
  surname?: string;

  // Пробелы, скобки и чёрточки не ошибка: номер приводится к общему виду
  // дальше, в normalizePhone. «8 928…» и «+7 928…» — один и тот же человек.
  @Matches(/^[\d\s()+-]{10,20}$/, { message: 'Телефон должен состоять из 10–15 цифр' })
  phone: string;

  @IsOptional() @Matches(/^[\d\s()+-]{10,20}$/, { message: 'Номер WhatsApp: 10–15 цифр' })
  whatsapp?: string;

  @IsString() @MaxLength(200)
  password: string;
}

export class LoginDto {
  // Пробелы, скобки и чёрточки не ошибка: номер приводится к общему виду
  // дальше, в normalizePhone. «8 928…» и «+7 928…» — один и тот же человек.
  @Matches(/^[\d\s()+-]{10,20}$/, { message: 'Телефон должен состоять из 10–15 цифр' })
  phone: string;

  @IsString() @MaxLength(200)
  password: string;
}

export class UpdateDto {
  @IsOptional() @IsString() @MaxLength(80)
  name?: string;

  @IsOptional() @IsString() @MaxLength(80)
  surname?: string;

  @IsOptional() @Matches(/^[\d\s()+-]{10,20}$/, { message: 'Номер WhatsApp: 10–15 цифр' })
  whatsapp?: string;

  /** Смена пароля: нужен и старый, иначе чужой телефон в руках — чужой аккаунт. */
  @IsOptional() @IsString() @MaxLength(200)
  password?: string;

  @IsOptional() @IsString() @MaxLength(200)
  oldPassword?: string;
}

type ClientRow = {
  id: bigint; name: string; surname: string | null; phone: string;
  whatsapp: string | null; pass_hash: string | null;
};

const card = (c: ClientRow) => ({
  // ID аккаунта: его человек отправляет клубу в WhatsApp вместо телефона
  id: Number(c.id),
  name: c.name, surname: c.surname ?? null,
  phone: c.phone, whatsapp: c.whatsapp ?? null,
  hasPassword: !!c.pass_hash,
});

@Controller('clients')
export class ClientsController {
  constructor(
    private readonly db: PrismaService,
    private readonly auth: ClientAuthService,
    private readonly club: ClubService,
  ) {}

  /** Есть ли такой номер и защищён ли он паролем.
   *
   *  Отдаём ровно два признака и, если пароля нет, анкету — ту самую, что
   *  человек сам ввёл. Так приложение после переустановки понимает, что
   *  показать: форму входа или заполненную регистрацию. Ничего о записях
   *  и деньгах здесь нет. */
  @Get('check')
  async check(@Req() req: any, @Query('phone') phone?: string) {
    const key = normalizePhone(phone);
    if (!key) throw new BadRequestException('Нужен номер телефона');
    limitRate(`check:${ipOf(req)}`, 60, 60_000, 'Слишком много проверок подряд. Подождите минуту');
    const c = await this.db.clients.findUnique({ where: { phone: key } });
    // Анкету не отдаём: перебором номеров иначе выгружалась база клиентов клуба
    return { known: !!c, hasPassword: !!c?.pass_hash, profile: null };
  }

  /* ── подтверждение номера звонком ─────────────────────────────────────
     Человек звонит на выданный номер 8-800, звонок сбрасывается, SMS.ru
     отмечает номер подтверждённым. Приложение спрашивает статус раз в три
     секунды и, получив подтверждение, заканчивает регистрацию. */

  /** Выдать номер, на который надо позвонить. */
  @Post('call/start')
  async callStart(@Req() req: any, @Body() body: { phone?: string; secret?: string }) {
    if (!callProvider) {
      throw new HttpException({ code: 'call_disabled',
        message: 'Подтверждение номера сейчас недоступно. Позвоните в клуб.' }, 503);
    }
    const phone = normalizePhone(body?.phone);
    if (!phone) throw new BadRequestException('Введите номер полностью');
    if (!RU_MOBILE.test(phone)) {
      throw new HttpException({ code: 'phone_not_supported',
        message: 'Подтверждаем только мобильные номера России' }, 422);
    }
    // Номер уже зарегистрирован — подтверждать нечего, надо входить паролем
    const known = await this.db.clients.findUnique({ where: { phone } });
    if (known?.pass_hash) {
      throw new HttpException({ code: 'phone_taken',
        message: 'Этот номер уже зарегистрирован. Войдите по паролю.' }, 409);
    }

    const ip = ipOf(req);
    const now = Date.now();
    const toClient = (e: { secret: string; callPhone: string; callPhonePretty: string; expiresAt: number }) => ({
      secret: e.secret, callPhone: e.callPhone, callPhonePretty: e.callPhonePretty,
      expiresInSec: Math.max(1, Math.round((e.expiresAt - now) / 1000)),
    });

    // Номер уже ждёт звонка: той же вкладке — тот же номер, чужой — отказ.
    // Иначе посторонний, опрашивая статус, забрал бы чужое подтверждение.
    const live = calls.active(phone);
    if (live) {
      if (calls.owns(live, body?.secret)) return toClient(live);
      const left = Math.max(1, Math.ceil((live.expiresAt - now) / 60_000));
      throw new HttpException({ code: 'call_busy',
        message: `Этот номер уже ждёт звонка. Попробуйте через ${left} мин.` }, 429);
    }

    const can = calls.canStart(phone, ip);
    if (!can.ok) throw new HttpException({ code: 'call_rate_limited', message: LIMIT_TEXT[can.reason] }, 429);
    calls.countStart(phone, ip);

    const added = await callProvider.add(phone, ip || null);
    if (!added.ok) {
      calls.forget(phone);
      const bad = added.reason === 'invalid_number';
      throw new HttpException({ code: bad ? 'phone_invalid' : 'call_unavailable',
        message: bad ? 'Этот номер не подходит. Проверьте его.'
                     : 'Подтверждение звонком сейчас недоступно. Попробуйте через минуту.' },
        bad ? 422 : 503);
    }
    return toClient(calls.remember(phone, added));
  }

  /** Был ли звонок. Приложение спрашивает раз в три секунды. */
  @Post('call/status')
  async callStatus(@Req() req: any, @Body() body: { phone?: string; secret?: string }) {
    if (!callProvider) {
      throw new HttpException({ code: 'call_disabled',
        message: 'Подтверждение номера сейчас недоступно. Позвоните в клуб.' }, 503);
    }
    const phone = normalizePhone(body?.phone);
    if (!phone) throw new BadRequestException('Введите номер полностью');
    limitRate(`callst:${ipOf(req)}`, 240, 60_000, 'Слишком часто. Подождите минуту');

    const e = calls.active(phone);
    if (!e || !calls.owns(e, body?.secret)) {
      throw new HttpException({ code: 'call_expired',
        message: 'Время вышло — получите новый номер' }, 410);
    }
    // К SMS.ru — не чаще раза в две секунды на номер; между опросами
    // отвечаем «ещё ждём», не тратя запрос
    if (!calls.shouldPoll(e)) return { confirmed: false };

    const st = await callProvider.status(e.checkId);
    if (st === 'confirmed') return { confirmed: true, verificationToken: calls.confirm(phone) };
    if (st === 'expired') {
      calls.forget(phone);
      throw new HttpException({ code: 'call_expired', message: 'Время вышло — получите новый номер' }, 410);
    }
    // Сбой провайдера — тоже «ждём»: следующий опрос спросит снова
    return { confirmed: false };
  }

  /** Завести аккаунт или задать пароль номеру, который клуб уже знает. */
  @Post('register')
  async register(@Req() req: any, @Body() dto: RegisterDto) {
    limitRate(`register:${ipOf(req)}`, 15, 3600_000, 'Слишком много регистраций подряд. Попробуйте через час');
    const key = normalizePhone(dto.phone);
    if (!key) throw new BadRequestException('Не разобрал номер телефона');
    const name = dto.name.trim();
    if (name.length < 2) throw new BadRequestException('Имя слишком короткое');

    let password: string;
    try { password = checkClientPassword(dto.password) }
    catch (e) { throw new BadRequestException((e as Error).message) }

    // Номер должен быть подтверждён звонком. Иначе тот, кто знает чужой
    // номер, задавал бы по нему пароль и видел чужие записи.
    const set = await this.club.get();
    if (set.phoneVerifyOn) {
      if (!calls.tokenValid(dto.verificationToken, key)) {
        throw new HttpException({ code: 'phone_verification_required',
          message: 'Подтвердите номер звонком ещё раз.' }, 428);
      }
    }

    const exists = await this.db.clients.findUnique({ where: { phone: key } });
    // Клуб видит в журнале, что на известный ему номер задали пароль
    if (exists && !exists.pass_hash) {
      const played = await this.db.bookings.count({ where: { client_id: exists.id } });
      if (played > 0) {
        await this.db.admin_log.create({ data: {
          admin_name: 'приложение', action: 'на известный номер задали пароль',
          details: `${exists.name}, ${key}, записей: ${played}`,
        }});
      }
    }
    if (exists?.pass_hash) {
      throw new ConflictException('У этого номера уже есть пароль. Войдите или попросите менеджера сбросить его.');
    }

    const wa = dto.whatsapp ? normalizePhone(dto.whatsapp) : null;
    const c = await this.db.clients.upsert({
      where: { phone: key },
      update: {
        name, surname: dto.surname?.trim() || null,
        ...(wa ? { whatsapp: wa } : {}),
        pass_hash: await this.auth.hash(password), pass_at: new Date(),
      },
      create: {
        phone: key, name, surname: dto.surname?.trim() || null, whatsapp: wa,
        pass_hash: await this.auth.hash(password), pass_at: new Date(),
      },
    });
    calls.consume(dto.verificationToken);
    return { token: await this.auth.startSession(c.id), profile: card(c) };
  }

  @Post('login')
  async login(@Req() req: any, @Body() dto: LoginDto) {
    const key = normalizePhone(dto.phone);
    if (!key) throw new BadRequestException('Не разобрал номер телефона');

    const keys = [`p:${key}`, `i:${ipOf(req)}`];
    const left = this.auth.lockedFor(keys);
    if (left > 0) {
      throw new HttpException(
        `Слишком много попыток. Попробуйте через ${Math.ceil(left / 60)} мин`, 429);
    }

    const c = await this.db.clients.findUnique({ where: { phone: key } });
    if (!c?.pass_hash || !(await this.auth.verify(dto.password, c.pass_hash))) {
      this.auth.noteFail(keys);
      throw new UnauthorizedException('Неверный номер или пароль');
    }
    this.auth.clearFails(keys);
    return { token: await this.auth.startSession(c.id), profile: card(c) };
  }

  /** Удаление аккаунта — требование Apple к приложениям с регистрацией.
   *
   *  Строку клиента не удаляем: на ней висят прошлые брони и деньги клуба.
   *  Стираем всё личное (имя, номера, пароль), закрываем входы и снимаем
   *  будущие записи, чтобы время вернулось в расписание. */
  @Post('me/delete')
  async removeMe(@Body() body: { password?: string }, @Headers('authorization') header?: string) {
    const c = await this.auth.whoIs(this.auth.tokenOf(header));
    if (!c) throw new UnauthorizedException('Нужно войти');
    if (c.pass_hash && !(await this.auth.verify(String(body?.password ?? ''), c.pass_hash))) {
      // 403, а не 401: вход действует, просто пароль не тот — приложение не должно
      // от этого выкидывать из аккаунта
      throw new ForbiddenException('Неверный пароль');
    }
    const now = new Date();
    await this.db.$transaction([
      this.db.bookings.updateMany({
        where: { client_id: c.id, status: { in: ['pending', 'confirmed'] }, starts_at: { gt: now } },
        data: { status: 'cancelled', status_at: now, status_by: 'клиент удалил аккаунт' },
      }),
      this.db.tournament_entries.updateMany({
        where: { client_id: c.id, status: { in: ['pending', 'confirmed'] }, tournaments: { starts_at: { gt: now } } },
        data: { status: 'cancelled', hold_until: null, status_at: now, status_by: 'клиент удалил аккаунт' },
      }),
      this.db.notifications.deleteMany({ where: { client_id: c.id } }),
      this.db.client_sessions.deleteMany({ where: { client_id: c.id } }),
      this.db.clients.update({ where: { id: c.id }, data: {
        name: 'Удалённый аккаунт', surname: null,
        // Номер должен остаться неповторимым, но узнать по нему человека уже нельзя
        phone: `удалён-${c.id}`, whatsapp: null, pass_hash: null, pass_at: null, note: null,
      }}),
      this.db.admin_log.create({ data: {
        admin_name: 'приложение', action: 'клиент удалил аккаунт',
        details: `ID ${Number(c.id)}, будущие записи сняты`,
      }}),
    ]);
    return { ok: true };
  }

  @Post('logout')
  async logout(@Headers('authorization') header?: string) {
    await this.auth.logout(this.auth.tokenOf(header));
    return { ok: true };
  }

  /** Своя анкета. */
  @Get('me')
  async me(@Headers('authorization') header?: string) {
    const c = await this.auth.whoIs(this.auth.tokenOf(header));
    if (!c) throw new UnauthorizedException('Нужно войти');
    return card(c);
  }

  /** Правка анкеты и смена пароля. */
  @Post('me')
  async update(@Body() dto: UpdateDto, @Headers('authorization') header?: string) {
    const c = await this.auth.whoIs(this.auth.tokenOf(header));
    if (!c) throw new UnauthorizedException('Нужно войти');

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      const n = dto.name.trim();
      if (n.length < 2) throw new BadRequestException('Имя слишком короткое');
      data.name = n;
    }
    if (dto.surname !== undefined) data.surname = dto.surname.trim() || null;
    if (dto.whatsapp !== undefined) data.whatsapp = normalizePhone(dto.whatsapp);

    if (dto.password !== undefined) {
      let password: string;
      try { password = checkClientPassword(dto.password) }
      catch (e) { throw new BadRequestException((e as Error).message) }
      // Старый пароль обязателен, если он был: телефон могли оставить на столе
      if (c.pass_hash && !(await this.auth.verify(dto.oldPassword ?? '', c.pass_hash))) {
        throw new ForbiddenException('Неверный текущий пароль');
      }
      data.pass_hash = await this.auth.hash(password);
      data.pass_at = new Date();
    }

    const updated = await this.db.clients.update({ where: { id: c.id }, data });

    // Пароль сменили — чужие устройства отпадают, своё входит заново
    if (data.pass_hash) {
      await this.auth.dropSessions(c.id);
      return { token: await this.auth.startSession(c.id), profile: card(updated) };
    }
    return { profile: card(updated) };
  }
}
