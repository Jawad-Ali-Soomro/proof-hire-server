import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../services/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import {
  CreateNotificationInput,
  NotificationPayload,
  NotificationType,
} from './notification.types';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private gateway: NotificationsGateway,
  ) {}

  private serialize(row: {
    id: number;
    userId: number;
    type: string;
    title: string;
    body: string;
    link: string | null;
    read: boolean;
    metadata: unknown;
    createdAt: Date;
  }): NotificationPayload {
    return {
      id: row.id,
      userId: row.userId,
      type: row.type,
      title: row.title,
      body: row.body,
      link: row.link,
      read: row.read,
      metadata:
        row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async pushUnreadCount(userId: number) {
    const count = await this.prisma.notification.count({
      where: { userId, read: false },
    });
    this.gateway.emitUnreadCount(userId, count);
  }

  async create(input: CreateNotificationInput): Promise<NotificationPayload> {
    const row = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link ?? null,
        metadata:
          input.metadata != null
            ? (input.metadata as Prisma.InputJsonValue)
            : undefined,
      },
    });
    const payload = this.serialize(row);
    this.gateway.emitToUser(input.userId, payload);
    await this.pushUnreadCount(input.userId);
    return payload;
  }

  async listForUser(userId: number, limit = 40) {
    const take = Math.min(Math.max(limit, 1), 100);
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows.map((r) => this.serialize(r));
  }

  async unreadCount(userId: number) {
    return this.prisma.notification.count({
      where: { userId, read: false },
    });
  }

  async markRead(notificationId: number, userId: number) {
    const row = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!row) throw new NotFoundException('Notification not found');
    if (row.read) return this.serialize(row);
    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });
    await this.pushUnreadCount(userId);
    return this.serialize(updated);
  }

  async markAllRead(userId: number) {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    await this.pushUnreadCount(userId);
    return { ok: true };
  }

  /** —— Event helpers (called from jobs / contracts) —— */

  async notifyBidReceived(params: {
    clientId: number;
    jobId: number;
    jobTitle: string;
    freelancerName: string;
    bidId: number;
    amount: number;
  }) {
    return this.create({
      userId: params.clientId,
      type: NotificationType.BID_RECEIVED,
      title: 'New bid on your project',
      body: `${params.freelancerName} bid $${params.amount.toLocaleString()} on “${params.jobTitle}”.`,
      link: `/dashboard/client/projects/${params.jobId}`,
      metadata: {
        jobId: params.jobId,
        bidId: params.bidId,
      },
    });
  }

  async notifyBidAccepted(params: {
    freelancerId: number;
    jobId: number;
    jobTitle: string;
    contractId: number;
  }) {
    return this.create({
      userId: params.freelancerId,
      type: NotificationType.BID_ACCEPTED,
      title: 'Your bid was accepted',
      body: `You were hired for “${params.jobTitle}”. Start the contract when ready.`,
      link: '/dashboard/contracts',
      metadata: {
        jobId: params.jobId,
        contractId: params.contractId,
      },
    });
  }

  async notifyBidRejected(params: {
    freelancerId: number;
    jobId: number;
    jobTitle: string;
  }) {
    return this.create({
      userId: params.freelancerId,
      type: NotificationType.BID_REJECTED,
      title: 'Bid not selected',
      body: `Your proposal on “${params.jobTitle}” was not selected.`,
      link: '/dashboard/bids',
      metadata: { jobId: params.jobId },
    });
  }

  async notifyContractStarted(params: {
    clientId: number;
    contractId: number;
    jobTitle: string;
    freelancerName: string;
  }) {
    return this.create({
      userId: params.clientId,
      type: NotificationType.CONTRACT_STARTED,
      title: 'Contract started',
      body: `${params.freelancerName} started work on “${params.jobTitle}”.`,
      link: '/dashboard/contracts',
      metadata: { contractId: params.contractId },
    });
  }

  async notifyMilestoneCompleted(params: {
    clientId: number;
    contractId: number;
    jobTitle: string;
    milestoneTitle: string;
  }) {
    return this.create({
      userId: params.clientId,
      type: NotificationType.MILESTONE_COMPLETED,
      title: 'Milestone completed',
      body: `“${params.milestoneTitle}” was marked complete on “${params.jobTitle}”.`,
      link: '/dashboard/contracts',
      metadata: { contractId: params.contractId },
    });
  }

  async notifyWorkMarkedComplete(params: {
    recipientId: number;
    contractId: number;
    jobTitle: string;
    byRole: 'CLIENT' | 'FREELANCER';
  }) {
    const who = params.byRole === 'CLIENT' ? 'The client' : 'The freelancer';
    return this.create({
      userId: params.recipientId,
      type: NotificationType.WORK_MARKED_COMPLETE,
      title: 'Contract marked complete',
      body: `${who} marked “${params.jobTitle}” as complete. Confirm when you agree.`,
      link: '/dashboard/contracts',
      metadata: { contractId: params.contractId },
    });
  }

  async notifyPaymentSent(params: {
    freelancerId: number;
    contractId: number;
    jobTitle: string;
  }) {
    return this.create({
      userId: params.freelancerId,
      type: NotificationType.PAYMENT_SENT,
      title: 'Payment sent',
      body: `The client confirmed payment sent for “${params.jobTitle}”.`,
      link: '/dashboard/contracts',
      metadata: { contractId: params.contractId },
    });
  }

  async notifyPaymentReceived(params: {
    clientId: number;
    contractId: number;
    jobTitle: string;
  }) {
    return this.create({
      userId: params.clientId,
      type: NotificationType.PAYMENT_RECEIVED,
      title: 'Payment received',
      body: `The freelancer confirmed payment received for “${params.jobTitle}”.`,
      link: '/dashboard/contracts',
      metadata: { contractId: params.contractId },
    });
  }

  async notifyContractFinalized(params: {
    userId: number;
    contractId: number;
    jobTitle: string;
  }) {
    return this.create({
      userId: params.userId,
      type: NotificationType.CONTRACT_FINALIZED,
      title: 'Contract finalized',
      body: `“${params.jobTitle}” is complete. View it in History.`,
      link: '/dashboard/history',
      metadata: { contractId: params.contractId },
    });
  }
}
