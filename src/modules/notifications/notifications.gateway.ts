import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import type { NotificationPayload } from './notification.types';

@WebSocketGateway({
  namespace: '/notifications',
  cors: { origin: true, credentials: true },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const raw =
        (client.handshake.auth?.token as string | undefined) ||
        (client.handshake.query?.token as string | undefined);
      const token = typeof raw === 'string' ? raw.replace(/^Bearer\s+/i, '') : '';
      if (!token) {
        client.disconnect(true);
        return;
      }
      const payload = await this.jwtService.verifyAsync<{
        sub: number;
        email: string;
        role: string;
      }>(token);
      const userId = Number(payload.sub);
      if (!Number.isFinite(userId)) {
        client.disconnect(true);
        return;
      }
      client.data.userId = userId;
      await client.join(this.userRoom(userId));
      client.emit('connected', { userId });
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId as number | undefined;
    if (userId) {
      this.logger.debug(`Socket disconnected for user ${userId}`);
    }
  }

  userRoom(userId: number) {
    return `user:${userId}`;
  }

  emitToUser(userId: number, notification: NotificationPayload) {
    this.server?.to(this.userRoom(userId)).emit('notification', notification);
  }

  emitUnreadCount(userId: number, count: number) {
    this.server?.to(this.userRoom(userId)).emit('unread_count', { count });
  }
}
