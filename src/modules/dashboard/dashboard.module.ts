import { Module } from '@nestjs/common';
import { PrismaModule } from '../../services/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [PrismaModule, AuthModule],
  exports: [DashboardService],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
