import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, Max, Min,
  MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';


export class CreateBookingDto {
  @IsString() @MaxLength(32)
  courtId: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Дата должна быть в виде ГГГГ-ММ-ДД' })
  date: string;

  // Настоящие границы — часы работы клуба — проверяет контроллер:
  // они лежат в базе и меняются менеджером из админки.
  @IsInt({ message: 'Час — целое число' }) @Min(0, { message: 'Час от 0 до 23' }) @Max(23, { message: 'Час от 0 до 23' })
  hour: number;

  @IsInt({ message: 'Часы — целое число' }) @Min(1, { message: 'Минимум 1 час' }) @Max(12, { message: 'Не больше 12 часов' })
  hours: number;

  @IsString() @MaxLength(80)
  name: string;

  @IsOptional() @IsString() @MaxLength(80)
  surname?: string;

  @Matches(/^\+?\d{10,15}$/, { message: 'Телефон должен состоять из 10–15 цифр' })
  phone: string;

  /** Второй номер: WhatsApp, если он отличается от телефона.
   *  Менеджеру нужно знать, куда писать подтверждение. */
  @IsOptional() @Matches(/^\+?\d{10,15}$/, { message: 'Номер WhatsApp: 10–15 цифр' })
  whatsapp?: string;

  @IsOptional() @IsString() @MaxLength(300)
  comment?: string;

  /** Тренер, выбранный галочкой «играть с тренером».
   *  Клуб потом подтверждает: если тренер не сможет, менеджер предложит другого. */
  @IsOptional() @IsInt() @Min(1)
  coachId?: number;

  /** Услуга «Семейный»: корт готовят закрытым. */
  @IsOptional() @IsBoolean()
  family?: boolean;

  /** Прокат и мячи, отмеченные при записи: идут в счёт брони
   *  и оплачиваются вместе с кортом. */
  @IsOptional() @IsArray() @ArrayMaxSize(20)
  @ValidateNested({ each: true }) @Type(() => BookingItemDto)
  items?: BookingItemDto[];
}

/** Одна позиция проката или товара в заявке. */
export class BookingItemDto {
  @IsInt() @Min(1)
  productId: number;

  @IsInt() @Min(1) @Max(20)
  qty: number;
}
