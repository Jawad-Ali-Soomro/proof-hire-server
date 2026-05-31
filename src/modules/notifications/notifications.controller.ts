import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  list(
    @Req() req: { user: { userId: number } },
    @Query('limit') limit?: string,
  ) {
    const n = limit ? parseInt(limit, 10) : 40;
    return this.notificationsService.listForUser(
      req.user.userId,
      Number.isFinite(n) ? n : 40,
    );
  }

  @Get('unread-count')
  unreadCount(@Req() req: { user: { userId: number } }) {
    return this.notificationsService
      .unreadCount(req.user.userId)
      .then((count) => ({ count }));
  }

  @Patch('read-all')
  markAllRead(@Req() req: { user: { userId: number } }) {
    return this.notificationsService.markAllRead(req.user.userId);
  }

  @Patch(':id/read')
  markRead(
    @Req() req: { user: { userId: number } },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.notificationsService.markRead(id, req.user.userId);
  }
}
