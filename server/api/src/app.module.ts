import { Module } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { ClubService } from './club';
import { CourtsController } from './courts/courts.controller';
import { AvailabilityController } from './courts/availability.controller';
import { BookingsController } from './bookings/bookings.controller';
import { TournamentsController } from './tournaments/tournaments.controller';
import { HealthController } from './health.controller';
import { AdminController } from './admin/admin.controller';

@Module({
  controllers: [
    HealthController, CourtsController, AvailabilityController,
    BookingsController, TournamentsController, AdminController,
  ],
  providers: [PrismaService, ClubService],
})
export class AppModule {}
