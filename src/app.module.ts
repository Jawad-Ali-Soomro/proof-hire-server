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
@Module({
  imports: [UsersModule, JobsModule, ProfileModule, BidsModule, ContractsModule, PaymentsModule, ReviewsModule, AuthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
