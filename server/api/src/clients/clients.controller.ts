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
// Восстановление пароля: через менеджера. Он и так разговаривает с человеком
// по телефону и может сбросить пароль из админки. Кода по SMS нет — нужен
// провайдер рассылки и решение клуба (вопрос Q57).
import {
  BadRequestException, Body, ConflictException, Controller, Get, Headers,
  HttpException, Post, Query, UnauthorizedException,
} from '@nestjs/common';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../phone';
import { ClientAuthService, checkClientPassword } from './client-auth.service';

export class RegisterDto {
  @IsString() @MaxLength(80)
  name: string;

  @IsOptional() @IsString() @MaxLength(80)
  surname?: string;

  @Matches(/^\+?\d{10,15}$/, { message: 'Телефон должен состоять из 10–15 цифр' })
  phone: string;

  @IsOptional() @Matches(/^\+?\d{10,15}$/, { message: 'Номер WhatsApp: 10–15 цифр' })
  whatsapp?: string;

  @IsString() @MaxLength(200)
  password: string;
}

export class LoginDto {
  @Matches(/^\+?\d{10,15}$/, { message: 'Телефон должен состоять из 10–15 цифр' })
  phone: string;

  @IsString() @MaxLength(200)
  password: string;
}

export class UpdateDto {
  @IsOptional() @IsString() @MaxLength(80)
  name?: string;

  @IsOptional() @IsString() @MaxLength(80)
  surname?: string;

  @IsOptional() @Matches(/^\+?\d{10,15}$/, { message: 'Номер WhatsApp: 10–15 цифр' })
  whatsapp?: string;

  /** Смена пароля: нужен и старый, иначе чужой телефон в руках — чужой аккаунт. */
  @IsOptional() @IsString() @MaxLength(200)
  password?: string;

  @IsOptional() @IsString() @MaxLength(200)
  oldPassword?: string;
}

type ClientRow = {
  name: string; surname: string | null; phone: string;
  whatsapp: string | null; pass_hash: string | null;
};

const card = (c: ClientRow) => ({
  name: c.name, surname: c.surname ?? null,
  phone: c.phone, whatsapp: c.whatsapp ?? null,
  hasPassword: !!c.pass_hash,
});

@Controller('clients')
export class ClientsController {
  constructor(
    private readonly db: PrismaService,
    private readonly auth: ClientAuthService,
  ) {}

  /** Есть ли такой номер и защищён ли он паролем.
   *
   *  Отдаём ровно два признака и, если пароля нет, анкету — ту самую, что
   *  человек сам ввёл. Так приложение после переустановки понимает, что
   *  показать: форму входа или заполненную регистрацию. Ничего о записях
   *  и деньгах здесь нет. */
  @Get('check')
  async check(@Query('phone') phone?: string) {
    const key = normalizePhone(phone);
    if (!key) throw new BadRequestException('Нужен номер телефона');
    const c = await this.db.clients.findUnique({ where: { phone: key } });
    if (!c) return { known: false, hasPassword: false, profile: null };
    return {
      known: true,
      hasPassword: !!c.pass_hash,
      profile: c.pass_hash ? null : card(c),
    };
  }

  /** Завести аккаунт или задать пароль номеру, который клуб уже знает. */
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const key = normalizePhone(dto.phone);
    if (!key) throw new BadRequestException('Не разобрал номер телефона');
    const name = dto.name.trim();
    if (name.length < 2) throw new BadRequestException('Имя слишком короткое');

    let password: string;
    try { password = checkClientPassword(dto.password) }
    catch (e) { throw new BadRequestException((e as Error).message) }

    const exists = await this.db.clients.findUnique({ where: { phone: key } });
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
    return { token: await this.auth.startSession(c.id), profile: card(c) };
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Headers('x-forwarded-for') ip?: string) {
    const key = normalizePhone(dto.phone);
    if (!key) throw new BadRequestException('Не разобрал номер телефона');

    const keys = [`p:${key}`, `i:${(ip ?? '').split(',')[0].trim() || 'нет'}`];
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
        throw new UnauthorizedException('Неверный текущий пароль');
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
