import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { ChatService } from './chat.service';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Get('threads')
  listThreads(@Req() req: { user: { userId: number } }) {
    return this.chatService.listThreads(req.user.userId);
  }

  @Get('tasks')
  listAllTasks(@Req() req: { user: { userId: number } }) {
    return this.chatService.listAllTasksForUser(req.user.userId);
  }

  @Get('users/:otherUserId')
  getRoomWithUser(
    @Req() req: { user: { userId: number } },
    @Param('otherUserId', ParseIntPipe) otherUserId: number,
  ) {
    return this.chatService.getRoomWithUser(otherUserId, req.user.userId);
  }

  @Post('users/:otherUserId/messages')
  sendMessageToUser(
    @Req() req: { user: { userId: number } },
    @Param('otherUserId', ParseIntPipe) otherUserId: number,
    @Body() body: { content: string },
  ) {
    return this.chatService.sendMessageToUser(
      otherUserId,
      req.user.userId,
      body.content,
    );
  }

  @Post('users/:otherUserId/tasks')
  createTaskForUser(
    @Req() req: { user: { userId: number } },
    @Param('otherUserId', ParseIntPipe) otherUserId: number,
    @Body() body: { title: string; description?: string; contractId?: number },
  ) {
    return this.chatService.createTaskForUser(
      otherUserId,
      req.user.userId,
      body,
    );
  }

  /** @deprecated Prefer GET /chat/users/:otherUserId */
  @Get('contracts/:contractId')
  getRoom(
    @Req() req: { user: { userId: number } },
    @Param('contractId', ParseIntPipe) contractId: number,
  ) {
    return this.chatService.getRoom(contractId, req.user.userId);
  }

  @Post('contracts/:contractId/messages')
  sendMessage(
    @Req() req: { user: { userId: number } },
    @Param('contractId', ParseIntPipe) contractId: number,
    @Body() body: { content: string },
  ) {
    return this.chatService.sendMessage(
      contractId,
      req.user.userId,
      body.content,
    );
  }

  @Get('contracts/:contractId/tasks')
  listTasks(
    @Req() req: { user: { userId: number } },
    @Param('contractId', ParseIntPipe) contractId: number,
  ) {
    return this.chatService.listTasks(contractId, req.user.userId);
  }

  @Post('contracts/:contractId/tasks')
  createTask(
    @Req() req: { user: { userId: number } },
    @Param('contractId', ParseIntPipe) contractId: number,
    @Body() body: { title: string; description?: string },
  ) {
    return this.chatService.createTask(contractId, req.user.userId, body);
  }

  @Patch('contracts/:contractId/tasks/:taskId')
  updateTask(
    @Req() req: { user: { userId: number } },
    @Param('contractId', ParseIntPipe) contractId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() body: { status: 'OPEN' | 'DONE' },
  ) {
    return this.chatService.updateTaskStatus(
      contractId,
      taskId,
      req.user.userId,
      body.status,
    );
  }
}
