import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
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
  }));
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  new Logger('API').log(`Слушаю порт ${port}`);
}
bootstrap();
