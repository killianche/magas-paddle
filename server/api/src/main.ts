import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

// BigInt из PostgreSQL не сериализуется в JSON сам по себе
(BigInt.prototype as any).toJSON = function () { return Number(this) };

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
