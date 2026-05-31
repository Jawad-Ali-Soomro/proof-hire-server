import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { ContractTaskStatus, MessageType } from '@prisma/client';
import { PrismaService } from '../../services/prisma.service';
import { ChatGateway } from './chat.gateway';
import type {
  ChatMessagePayload,
  ChatRoomPayload,
  ChatSender,
  ChatThreadSummary,
  ContractTaskPayload,
  ContractTaskWithProject,
  SharedContractSummary,
} from './chat.types';

const senderSelect = {
  id: true,
  username: true,
  profile: { select: { fullName: true, avatar: true } },
} as const;

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => ChatGateway))
    private gateway: ChatGateway,
  ) {}

  private buildDirectKey(userIdA: number, userIdB: number): string {
    const [a, b] =
      userIdA < userIdB ? [userIdA, userIdB] : [userIdB, userIdA];
    return `${a}:${b}`;
  }

  private toSender(user: {
    id: number;
    username: string;
    profile: { fullName: string | null; avatar: string | null } | null;
  }): ChatSender {
    return {
      id: user.id,
      username: user.username,
      fullName: user.profile?.fullName ?? null,
      avatar: user.profile?.avatar ?? null,
    };
  }

  private serializeMessage(
    row: {
      id: number;
      conversationId: number;
      content: string;
      type: MessageType;
      taskId: number | null;
      senderId: number;
      createdAt: Date;
      sender: {
        id: number;
        username: string;
        profile: { fullName: string | null; avatar: string | null } | null;
      };
    },
    contractId: number | null,
  ): ChatMessagePayload {
    return {
      id: row.id,
      conversationId: row.conversationId,
      contractId,
      content: row.content,
      type: row.type,
      taskId: row.taskId,
      senderId: row.senderId,
      sender: this.toSender(row.sender),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private serializeTask(row: {
    id: number;
    contractId: number;
    createdById: number;
    title: string;
    description: string | null;
    status: ContractTaskStatus;
    createdAt: Date;
    updatedAt: Date;
    createdBy: {
      id: number;
      username: string;
      profile: { fullName: string | null; avatar: string | null } | null;
    };
  }): ContractTaskPayload {
    return {
      id: row.id,
      contractId: row.contractId,
      createdById: row.createdById,
      title: row.title,
      description: row.description,
      status: row.status,
      createdBy: this.toSender(row.createdBy),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async assertCanMessage(userId: number, otherUserId: number) {
    if (userId === otherUserId) {
      throw new BadRequestException('Cannot message yourself');
    }
    const link = await this.prisma.contract.findFirst({
      where: {
        OR: [
          { clientId: userId, freelancerId: otherUserId },
          { clientId: otherUserId, freelancerId: userId },
        ],
      },
      select: { id: true },
    });
    if (!link) {
      throw new ForbiddenException(
        'You can only message users you have a project with',
      );
    }
  }

  async assertContractParty(contractId: number, userId: number) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      select: { id: true, clientId: true, freelancerId: true, status: true },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.clientId !== userId && contract.freelancerId !== userId) {
      throw new ForbiddenException('You are not part of this contract');
    }
    return contract;
  }

  private async sharedContractsBetween(
    userId: number,
    otherUserId: number,
  ): Promise<SharedContractSummary[]> {
    const rows = await this.prisma.contract.findMany({
      where: {
        OR: [
          { clientId: userId, freelancerId: otherUserId },
          { clientId: otherUserId, freelancerId: userId },
        ],
      },
      include: { job: { select: { id: true, title: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((c) => ({
      id: c.id,
      jobId: c.job.id,
      jobTitle: c.job.title,
      status: c.status,
    }));
  }

  private async counterpartyOpenTasks(
    userId: number,
    otherUserId: number,
  ): Promise<number> {
    const contracts = await this.prisma.contract.findMany({
      where: {
        OR: [
          { clientId: userId, freelancerId: otherUserId },
          { clientId: otherUserId, freelancerId: userId },
        ],
        status: { not: 'TERMINATED' },
      },
      select: { id: true },
    });
    if (!contracts.length) return 0;
    return this.prisma.contractTask.count({
      where: {
        contractId: { in: contracts.map((c) => c.id) },
        status: 'OPEN',
      },
    });
  }

  /** One P2P thread per user pair. */
  async ensureConversationForPair(userId: number, otherUserId: number) {
    await this.assertCanMessage(userId, otherUserId);
    const directKey = this.buildDirectKey(userId, otherUserId);
    const existing = await this.prisma.conversation.findUnique({
      where: { directKey },
    });
    if (existing) return existing;

    return this.prisma.conversation.create({
      data: {
        directKey,
        participants: {
          create: [{ userId }, { userId: otherUserId }],
        },
      },
    });
  }

  /** Ensures P2P chat exists when a contract is created (bid accepted). */
  async ensureConversationForContract(contractId: number) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      select: { clientId: true, freelancerId: true },
    });
    if (!contract) return null;
    return this.ensureConversationForPair(
      contract.clientId,
      contract.freelancerId,
    );
  }

  private async syncPairThreadsForUser(userId: number) {
    const contracts = await this.prisma.contract.findMany({
      where: {
        OR: [{ clientId: userId }, { freelancerId: userId }],
      },
      select: { clientId: true, freelancerId: true },
    });
    const seen = new Set<string>();
    for (const c of contracts) {
      const key = this.buildDirectKey(c.clientId, c.freelancerId);
      if (seen.has(key)) continue;
      seen.add(key);
      const otherId =
        c.clientId === userId ? c.freelancerId : c.clientId;
      await this.ensureConversationForPair(userId, otherId);
    }
  }

  async listThreads(userId: number): Promise<ChatThreadSummary[]> {
    await this.syncPairThreadsForUser(userId);

    const participations = await this.prisma.conversationParticipant.findMany({
      where: {
        userId,
        conversation: { directKey: { not: null } },
      },
      include: {
        conversation: {
          include: {
            participants: { include: { user: { select: senderSelect } } },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { sender: { select: senderSelect } },
            },
          },
        },
      },
    });

    const threads: ChatThreadSummary[] = [];
    const seenConv = new Set<number>();

    for (const row of participations) {
      const conv = row.conversation;
      if (seenConv.has(conv.id)) continue;
      seenConv.add(conv.id);

      const other = conv.participants.find((p) => p.userId !== userId);
      if (!other) continue;

      const counterparty = this.toSender(other.user);
      const last = conv.messages[0] ?? null;
      let contractId: number | null = null;
      if (last?.type === MessageType.TASK && last.taskId) {
        const task = await this.prisma.contractTask.findUnique({
          where: { id: last.taskId },
          select: { contractId: true },
        });
        contractId = task?.contractId ?? null;
      }

      threads.push({
        conversationId: conv.id,
        counterpartyId: counterparty.id,
        counterparty,
        lastMessage: last
          ? this.serializeMessage(last, contractId)
          : null,
        unreadHint: 0,
        openTasks: await this.counterpartyOpenTasks(userId, counterparty.id),
      });
    }

    threads.sort((a, b) => {
      const at = a.lastMessage?.createdAt ?? '';
      const bt = b.lastMessage?.createdAt ?? '';
      return bt.localeCompare(at);
    });

    return threads;
  }

  async getRoomWithUser(
    otherUserId: number,
    userId: number,
  ): Promise<ChatRoomPayload> {
    const conversation = await this.ensureConversationForPair(
      userId,
      otherUserId,
    );

    const otherUser = await this.prisma.user.findUnique({
      where: { id: otherUserId },
      select: senderSelect,
    });
    if (!otherUser) throw new NotFoundException('User not found');

    const sharedContracts = await this.sharedContractsBetween(
      userId,
      otherUserId,
    );
    const active = sharedContracts.filter((c) => c.status !== 'TERMINATED');
    const defaultContractId =
      active.length === 1 ? active[0].id : null;

    const messages = await this.prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: { sender: { select: senderSelect } },
    });

    const taskIds = messages
      .filter((m) => m.type === MessageType.TASK && m.taskId)
      .map((m) => m.taskId as number);
    const taskContractMap = new Map<number, number>();
    if (taskIds.length) {
      const tasks = await this.prisma.contractTask.findMany({
        where: { id: { in: taskIds } },
        select: { id: true, contractId: true },
      });
      for (const t of tasks) taskContractMap.set(t.id, t.contractId);
    }

    return {
      conversationId: conversation.id,
      counterparty: this.toSender(otherUser),
      sharedContracts,
      defaultContractId,
      messages: messages.map((m) =>
        this.serializeMessage(
          m,
          m.taskId ? (taskContractMap.get(m.taskId) ?? null) : null,
        ),
      ),
    };
  }

  /** @deprecated Use getRoomWithUser — resolves contract to the other party. */
  async getRoom(contractId: number, userId: number): Promise<ChatRoomPayload> {
    const contract = await this.assertContractParty(contractId, userId);
    const otherUserId =
      contract.clientId === userId
        ? contract.freelancerId
        : contract.clientId;
    return this.getRoomWithUser(otherUserId, userId);
  }

  private async touchConversation(conversationId: number) {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
  }

  async sendMessageToUser(
    otherUserId: number,
    userId: number,
    content: string,
  ) {
    const text = content?.trim();
    if (!text) throw new BadRequestException('Message is required');
    const conversation = await this.ensureConversationForPair(
      userId,
      otherUserId,
    );

    const row = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: userId,
        content: text,
        type: MessageType.TEXT,
      },
      include: { sender: { select: senderSelect } },
    });
    await this.touchConversation(conversation.id);
    const payload = this.serializeMessage(row, null);
    this.gateway.emitMessage(conversation.id, payload, [
      userId,
      otherUserId,
    ]);
    return payload;
  }

  async sendMessage(contractId: number, userId: number, content: string) {
    const contract = await this.assertContractParty(contractId, userId);
    const otherUserId =
      contract.clientId === userId
        ? contract.freelancerId
        : contract.clientId;
    return this.sendMessageToUser(otherUserId, userId, content);
  }

  private resolveTaskContractId(
    userId: number,
    otherUserId: number,
    contractId?: number,
  ): Promise<number> {
    return (async () => {
      if (contractId) {
        const contract = await this.assertContractParty(contractId, userId);
        const other =
          contract.clientId === userId
            ? contract.freelancerId
            : contract.clientId;
        if (other !== otherUserId) {
          throw new BadRequestException(
            'That project is not shared with this person',
          );
        }
        return contractId;
      }
      const shared = (
        await this.sharedContractsBetween(userId, otherUserId)
      ).filter((c) => c.status !== 'TERMINATED');
      if (shared.length === 1) return shared[0].id;
      if (!shared.length) {
        throw new BadRequestException('No active project with this person');
      }
      throw new BadRequestException(
        'Select which project this task belongs to',
      );
    })();
  }

  async createTaskForUser(
    otherUserId: number,
    userId: number,
    body: { title: string; description?: string; contractId?: number },
  ) {
    const title = body.title?.trim();
    if (!title) throw new BadRequestException('Task title is required');
    const contractId = await this.resolveTaskContractId(
      userId,
      otherUserId,
      body.contractId,
    );
    const contract = await this.assertContractParty(contractId, userId);
    const conversation = await this.ensureConversationForPair(
      userId,
      otherUserId,
    );

    const task = await this.prisma.contractTask.create({
      data: {
        contractId,
        createdById: userId,
        title,
        description: body.description?.trim() || null,
        status: ContractTaskStatus.OPEN,
      },
      include: { createdBy: { select: senderSelect } },
    });

    const taskPayload = this.serializeTask(task);
    const sender = this.toSender(task.createdBy);
    const displayName = sender.fullName || sender.username;

    const msg = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: userId,
        type: MessageType.TASK,
        taskId: task.id,
        content: `${displayName} created task - ${title}`,
      },
      include: { sender: { select: senderSelect } },
    });
    await this.touchConversation(conversation.id);
    const msgPayload = this.serializeMessage(msg, contractId);
    this.gateway.emitTask(contractId, taskPayload, 'created', [
      contract.clientId,
      contract.freelancerId,
    ]);
    this.gateway.emitMessage(conversation.id, msgPayload, [
      contract.clientId,
      contract.freelancerId,
    ]);
    return { task: taskPayload, message: msgPayload };
  }

  async createTask(
    contractId: number,
    userId: number,
    body: { title: string; description?: string },
  ) {
    const contract = await this.assertContractParty(contractId, userId);
    const otherUserId =
      contract.clientId === userId
        ? contract.freelancerId
        : contract.clientId;
    return this.createTaskForUser(otherUserId, userId, {
      ...body,
      contractId,
    });
  }

  async updateTaskStatus(
    contractId: number,
    taskId: number,
    userId: number,
    status: 'OPEN' | 'DONE',
  ) {
    const contract = await this.assertContractParty(contractId, userId);
    const task = await this.prisma.contractTask.findFirst({
      where: { id: taskId, contractId },
    });
    if (!task) throw new NotFoundException('Task not found');

    const next =
      status === 'DONE' ? ContractTaskStatus.DONE : ContractTaskStatus.OPEN;
    const updated = await this.prisma.contractTask.update({
      where: { id: taskId },
      data: { status: next },
      include: { createdBy: { select: senderSelect } },
    });
    const payload = this.serializeTask(updated);
    this.gateway.emitTask(contractId, payload, 'updated', [
      contract.clientId,
      contract.freelancerId,
    ]);
    return payload;
  }

  async listAllTasksForUser(userId: number): Promise<ContractTaskWithProject[]> {
    const contracts = await this.prisma.contract.findMany({
      where: {
        OR: [{ clientId: userId }, { freelancerId: userId }],
        status: { not: 'TERMINATED' },
      },
      select: { id: true, clientId: true, freelancerId: true },
    });
    const contractIds = contracts.map((c) => c.id);
    if (!contractIds.length) return [];

    const counterpartyByContract = new Map(
      contracts.map((c) => [
        c.id,
        c.clientId === userId ? c.freelancerId : c.clientId,
      ]),
    );

    const tasks = await this.prisma.contractTask.findMany({
      where: { contractId: { in: contractIds } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        createdBy: { select: senderSelect },
        contract: { include: { job: { select: { id: true, title: true } } } },
      },
    });

    return tasks.map((t) => ({
      ...this.serializeTask(t),
      jobId: t.contract.job.id,
      jobTitle: t.contract.job.title,
      counterpartyId: counterpartyByContract.get(t.contractId) ?? 0,
    }));
  }

  async listTasks(contractId: number, userId: number) {
    await this.assertContractParty(contractId, userId);
    const tasks = await this.prisma.contractTask.findMany({
      where: { contractId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: { createdBy: { select: senderSelect } },
    });
    return tasks.map((t) => this.serializeTask(t));
  }

  async assertConversationParticipant(conversationId: number, userId: number) {
    const row = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId },
    });
    if (!row) throw new ForbiddenException('Not in this conversation');
  }
}
