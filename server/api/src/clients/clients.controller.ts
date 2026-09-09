// Данные человека: имя, фамилия, номера.
//
// Входа с паролем в приложении нет намеренно: клуб узнаёт человека по номеру
// телефона, по нему же отдаются его записи. Здесь то же самое, только для
// анкеты — чтобы после переустановки приложения не пришлось вводить имя заново.
//
// ВОПРОС К ЗАКАЗЧИКУ (Q54): номер никак не подтверждается. Тот, кто знает
// чужой номер, увидит имя и историю посещений. Так же сегодня работает и
// список записей. Правильное решение — код по SMS при первом входе; для него
// нужен провайдер рассылки и решение клуба. До этого лишнего о человеке не
// отдаём: только то, что он сам ввёл, и ничего о деньгах.
import {
  BadRequestException, Body, Controller, Get, Post, Query,
} from '@nestjs/common';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../phone';

export class SaveClientDto {
  @IsString() @MaxLength(80)
  name: string;

  @IsOptional() @IsString() @MaxLength(80)
  surname?: string;

  @Matches(/^\+?\d{10,15}$/, { message: 'Телефон должен состоять из 10–15 цифр' })
  phone: string;

  @IsOptional() @Matches(/^\+?\d{10,15}$/, { message: 'Номер WhatsApp: 10–15 цифр' })
  whatsapp?: string;
}

@Controller('clients')
export class ClientsController {
  constructor(private readonly db: PrismaService) {}

  /** Анкета по номеру: чем заполнить приложение после переустановки. */
  @Get()
  async find(@Query('phone') phone?: string) {
    const key = normalizePhone(phone);
    if (!key) throw new BadRequestException('Нужен номер телефона');
    const c = await this.db.clients.findUnique({ where: { phone: key } });
    if (!c) return null;
    return {
      name: c.name, surname: c.surname ?? null,
      phone: c.phone, whatsapp: c.whatsapp ?? null,
    };
  }

  /** Сохранить анкету: при регистрации и при каждой правке данных. */
  @Post()
  async save(@Body() dto: SaveClientDto) {
    const key = normalizePhone(dto.phone);
    if (!key) throw new BadRequestException('Не разобрал номер телефона');
    const wa = dto.whatsapp ? normalizePhone(dto.whatsapp) : null;
    const name = dto.name.trim();
    if (name.length < 2) throw new BadRequestException('Имя слишком короткое');
    const surname = dto.surname?.trim() || null;

    const c = await this.db.clients.upsert({
      where: { phone: key },
      update: { name, surname, ...(wa ? { whatsapp: wa } : {}) },
      create: { phone: key, name, surname, whatsapp: wa },
    });
    return {
      name: c.name, surname: c.surname ?? null,
      phone: c.phone, whatsapp: c.whatsapp ?? null,
    };
  }
}
