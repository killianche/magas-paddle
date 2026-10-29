import 'reflect-metadata';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { PrismaErrorsFilter } from './prisma/errors.filter';
import { BadRequestException, ValidationPipe, Logger, type ValidationError } from '@nestjs/common';
import { AppModule } from './app.module';
import type { NestExpressApplication } from '@nestjs/platform-express';

// BigInt из PostgreSQL не сериализуется в JSON сам по себе
(BigInt.prototype as any).toJSON = function () { return Number(this) };

async function bootstrap() {
  // Фото площадок приходят из админки строкой base64 — стандартные 100 КБ
  // для тела запроса их не вмещают. 12 МБ хватает на фото до 8 МБ.
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '12mb' });
  app.setGlobalPrefix('api');
  app.enableCors({ origin: true });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, forbidNonWhitelisted: true, transform: true,
    // Ответ — одна строка по-русски. По умолчанию Nest отдаёт массив строк,
    // а приложение и админка ждут строку: человек видел «Не получилось»
    // вместо «Дата должна быть в виде ГГГГ-ММ-ДД» (аудит 15.10.2026).
    // Английские тексты по умолчанию («name must be a string») людям
    // не показываем — заменяем общей просьбой проверить данные.
    exceptionFactory: (errors: ValidationError[]) => {
      const all: string[] = [];
      const walk = (list: ValidationError[]) => list.forEach(e => {
        all.push(...Object.values(e.constraints ?? {}));
        if (e.children?.length) walk(e.children);
      });
      walk(errors);
      const ru = all.find(m => /[а-яё]/i.test(m));
      return new BadRequestException({ code: 'validation',
        message: ru ?? 'Проверьте введённые данные и попробуйте ещё раз.' });
    },
  }));
  // «Записи уже нет» и «такая уже есть» — 404 и 409, а не 500
  app.useGlobalFilters(new PrismaErrorsFilter(app.get(HttpAdapterHost).httpAdapter));
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  new Logger('API').log(`Слушаю порт ${port}`);
}
bootstrap();
