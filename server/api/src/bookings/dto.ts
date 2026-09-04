import { IsInt, IsOptional, IsString, Matches, Max, Min, MaxLength } from 'class-validator';
import { MAX_HOURS, OPEN_HOUR } from '../club';

export class CreateBookingDto {
  @IsString() @MaxLength(32)
  courtId: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Дата должна быть в виде ГГГГ-ММ-ДД' })
  date: string;

  @IsInt() @Min(OPEN_HOUR) @Max(23)
  hour: number;

  @IsInt() @Min(1) @Max(MAX_HOURS)
  hours: number;

  @IsString() @MaxLength(80)
  name: string;

  @Matches(/^\+?\d{10,15}$/, { message: 'Телефон должен состоять из 10–15 цифр' })
  phone: string;

  @IsOptional() @IsString() @MaxLength(300)
  comment?: string;
}
