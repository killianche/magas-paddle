import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: PrismaService) {}

  /** Проверка, что сервис жив и база отвечает. */
  @Get()
  async check() {
    await this.db.$queryRaw`SELECT 1`;
    return { ok: true, time: new Date().toISOString() };
  }
}
