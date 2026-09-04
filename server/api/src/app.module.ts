import { Module } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { CourtsController } from './courts/courts.controller';
import { AvailabilityController } from './courts/availability.controller';
import { BookingsController } from './bookings/bookings.controller';
import { TournamentsController } from './tournaments/tournaments.controller';
import { HealthController } from './health.controller';

@Module({
  controllers: [
    HealthController, CourtsController, AvailabilityController,
    BookingsController, TournamentsController,
  ],
  providers: [PrismaService],
})
export class AppModule {}
