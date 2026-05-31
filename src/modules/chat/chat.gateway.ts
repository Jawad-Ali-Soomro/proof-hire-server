import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import type { ChatMessagePayload, ContractTaskPayload } from './chat.types';

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: true, credentials: true },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private jwtService: JwtService,
    @Inject(forwardRef(() => ChatService))
    private chatService: ChatService,
  ) {}

  private async authClient(client: Socket): Promise<number | null> {
    const raw =
      (client.handshake.auth?.token as string | undefined) ||
      (client.handshake.query?.token as string | undefined);
    const token = typeof raw === 'string' ? raw.replace(/^Bearer\s+/i, '') : '';
    if (!token) return null;
    try {
      const payload = await this.jwtService.verifyAsync<{ sub: number }>(token);
      const userId = Number(payload.sub);
      return Number.isFinite(userId) ? userId : null;
    } catch {
      return null;
    }
  }

  async handleConnection(client: Socket) {
    const userId = await this.authClient(client);
    if (!userId) {
      client.disconnect(true);
      return;
    }
    client.data.userId = userId;
    await client.join(this.userRoom(userId));
    client.emit('connected', { userId });
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId as number | undefined;
    if (userId) this.logger.debug(`Chat socket disconnected user ${userId}`);
  }

  userRoom(userId: number) {
    return `user:${userId}`;
  }

  conversationRoom(conversationId: number) {
    return `conversation:${conversationId}`;
  }

  emitMessage(
    conversationId: number,
    message: ChatMessagePayload,
    participantUserIds: number[] = [],
  ) {
    const payload = message;
    this.server?.to(this.conversationRoom(conversationId)).emit('message', payload);
    const unique = [
      ...new Set(participantUserIds.filter((id) => Number.isFinite(id))),
    ];
    for (const userId of unique) {
      this.server?.to(this.userRoom(userId)).emit('message', payload);
    }
  }

  emitTask(
    contractId: number,
    task: ContractTaskPayload,
    action: 'created' | 'updated',
    participantUserIds: number[] = [],
  ) {
    const payload = { action, task };
    const unique = [
      ...new Set(participantUserIds.filter((id) => Number.isFinite(id))),
    ];
    for (const userId of unique) {
      this.server?.to(this.userRoom(userId)).emit('task', payload);
    }
  }

  @SubscribeMessage('join_conversation')
  async onJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId?: number },
  ) {
    const userId = client.data.userId as number | undefined;
    const conversationId = Number(body?.conversationId);
    if (!userId || !Number.isFinite(conversationId)) {
      return { ok: false, error: 'Invalid room' };
    }
    try {
      await this.chatService.assertConversationParticipant(
        conversationId,
        userId,
      );
      await client.join(this.conversationRoom(conversationId));
      return { ok: true, conversationId };
    } catch {
      return { ok: false, error: 'Access denied' };
    }
  }

  @SubscribeMessage('leave_conversation')
  async onLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId?: number },
  ) {
    const conversationId = Number(body?.conversationId);
    if (Number.isFinite(conversationId)) {
      await client.leave(this.conversationRoom(conversationId));
    }
    return { ok: true };
  }

  /** @deprecated Use join_conversation */
  @SubscribeMessage('join_contract')
  async onJoinContract(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { contractId?: number },
  ) {
    const userId = client.data.userId as number | undefined;
    const contractId = Number(body?.contractId);
    if (!userId || !Number.isFinite(contractId)) {
      return { ok: false, error: 'Invalid room' };
    }
    try {
      const room = await this.chatService.getRoom(contractId, userId);
      await client.join(this.conversationRoom(room.conversationId));
      return { ok: true, conversationId: room.conversationId };
    } catch {
      return { ok: false, error: 'Access denied' };
    }
  }

  @SubscribeMessage('leave_contract')
  async onLeaveContract(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { contractId?: number; conversationId?: number },
  ) {
    const conversationId = Number(body?.conversationId);
    if (Number.isFinite(conversationId)) {
      await client.leave(this.conversationRoom(conversationId));
    }
    return { ok: true };
  }
}
