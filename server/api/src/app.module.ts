import { Module } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { ClubService } from './club';
import { ClubController, CourtsController, PricesController } from './courts/courts.controller';
import { AvailabilityController } from './courts/availability.controller';
import { BookingsController } from './bookings/bookings.controller';
import { ClientsController } from './clients/clients.controller';
import { ClientAuthService } from './clients/client-auth.service';
import { TournamentsController } from './tournaments/tournaments.controller';
import { HealthController } from './health.controller';
import { AdminController, AdminAuthController } from './admin/admin.controller';
import { AuthService } from './admin/auth.service';

@Module({
  controllers: [
    HealthController, CourtsController, PricesController, AvailabilityController,
    ClubController,
    BookingsController, ClientsController, TournamentsController,
    AdminController, AdminAuthController,
  ],
  providers: [PrismaService, ClubService, AuthService, ClientAuthService],
})
export class AppModule {}
