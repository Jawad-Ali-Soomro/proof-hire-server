import { Module } from '@nestjs/common';
import { UsersModule } from './modules/users/users.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { AuthModule } from './modules/auth/auth.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { BidsModule } from './modules/bids/bids.module';
import { ProfileModule } from './modules/profile/profile.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ChatModule } from './modules/chat/chat.module';
import { AdminModule } from './modules/admin/admin.module';
import { CoinsModule } from './modules/coins/coins.module';

@Module({
  imports: [
    UsersModule,
    JobsModule,
    ProfileModule,
    BidsModule,
    ContractsModule,
    PaymentsModule,
    ReviewsModule,
    AuthModule,
    DashboardModule,
    NotificationsModule,
    ChatModule,
    AdminModule,
    CoinsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
