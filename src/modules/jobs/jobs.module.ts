import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { PrismaModule } from '../../services/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ContractsModule } from '../contracts/contracts.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatModule } from '../chat/chat.module';
import { CoinsModule } from '../coins/coins.module';

@Module({
  imports: [PrismaModule, AuthModule, ContractsModule, NotificationsModule, ChatModule, CoinsModule],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
