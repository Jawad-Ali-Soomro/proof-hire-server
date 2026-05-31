import { ForbiddenException, Injectable } from '@nestjs/common';
import { JobStatus, BidStatus, ContractStatus } from '@prisma/client';
import { PrismaService } from '../../services/prisma.service';

export type ChartSegment = {
  key: string;
  label: string;
  count: number;
  percent: number;
  color: string;
  description: string;
};

export type DashboardRecentTask = {
  id: number;
  title: string;
  status: string;
  contractId: number;
  jobTitle: string;
  counterpartyId: number;
  createdAt: string;
};

export type DashboardRecentThread = {
  conversationId: number;
  counterpartyId: number;
  counterpartyName: string;
  counterpartyAvatar: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  openTasks: number;
};

export type DashboardActivity = {
  recentTasks: DashboardRecentTask[];
  recentThreads: DashboardRecentThread[];
};

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  private toSegments(
    items: {
      label: string;
      key: string;
      count: number;
      color: string;
      description: string;
    }[],
  ): ChartSegment[] {
    const total = items.reduce((s, i) => s + i.count, 0);
    if (total === 0) {
      return items.map((i) => ({ ...i, percent: 0 }));
    }
    const raw = items.map((i) => ({
      ...i,
      percent: Math.round((i.count / total) * 100),
    }));
    const sum = raw.reduce((s, i) => s + i.percent, 0);
    if (sum !== 100 && raw.length > 0) {
      const maxIdx = raw.reduce(
        (best, cur, idx) => (cur.count > raw[best].count ? idx : best),
        0,
      );
      raw[maxIdx] = { ...raw[maxIdx], percent: raw[maxIdx].percent + (100 - sum) };
    }
    return raw;
  }

  private partyName(user: {
    username: string;
    profile: { fullName: string | null } | null;
  }) {
    return user.profile?.fullName?.trim() || user.username;
  }

  private async getSharedContractIds(userId: number) {
    const contracts = await this.prisma.contract.findMany({
      where: {
        OR: [{ clientId: userId }, { freelancerId: userId }],
        status: { not: 'TERMINATED' },
      },
      select: { id: true, clientId: true, freelancerId: true },
    });
    return contracts;
  }

  private async getActivity(userId: number): Promise<DashboardActivity> {
    const contracts = await this.getSharedContractIds(userId);
    const contractIds = contracts.map((c) => c.id);
    const counterpartyByContract = new Map(
      contracts.map((c) => [
        c.id,
        c.clientId === userId ? c.freelancerId : c.clientId,
      ]),
    );

    const recentTasks =
      contractIds.length > 0
        ? await this.prisma.contractTask.findMany({
            where: { contractId: { in: contractIds } },
            orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
            take: 5,
            include: {
              contract: { include: { job: { select: { title: true } } } },
            },
          })
        : [];

    const openTasksByCounterparty = new Map<number, number>();
    if (contractIds.length > 0) {
      const openTaskRows = await this.prisma.contractTask.findMany({
        where: { contractId: { in: contractIds }, status: 'OPEN' },
        select: { contractId: true },
      });
      for (const row of openTaskRows) {
        const cp = counterpartyByContract.get(row.contractId);
        if (cp) openTasksByCounterparty.set(cp, (openTasksByCounterparty.get(cp) ?? 0) + 1);
      }
    }

    const participations = await this.prisma.conversationParticipant.findMany({
      where: {
        userId,
        conversation: { directKey: { not: null } },
      },
      include: {
        conversation: {
          include: {
            participants: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    profile: { select: { fullName: true, avatar: true } },
                  },
                },
              },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { content: true, createdAt: true },
            },
          },
        },
      },
    });

    const threadRows: DashboardRecentThread[] = [];
    const seenConv = new Set<number>();

    for (const row of participations) {
      const conv = row.conversation;
      if (seenConv.has(conv.id)) continue;
      seenConv.add(conv.id);

      const other = conv.participants.find((p) => p.userId !== userId);
      if (!other) continue;

      const counterpartyId = other.user.id;
      const last = conv.messages[0] ?? null;
      threadRows.push({
        conversationId: conv.id,
        counterpartyId,
        counterpartyName: this.partyName(other.user),
        counterpartyAvatar: (other.user as any).profile?.avatar ?? null,
        lastMessage: last?.content ?? null,
        lastMessageAt: last?.createdAt.toISOString() ?? null,
        openTasks: openTasksByCounterparty.get(counterpartyId) ?? 0,
      });
    }

    threadRows.sort((a, b) => {
      const at = a.lastMessageAt ?? '';
      const bt = b.lastMessageAt ?? '';
      return bt.localeCompare(at);
    });

    return {
      recentTasks: recentTasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        contractId: t.contractId,
        jobTitle: t.contract.job.title,
        counterpartyId: counterpartyByContract.get(t.contractId) ?? 0,
        createdAt: t.createdAt.toISOString(),
      })),
      recentThreads: threadRows.slice(0, 4),
    };
  }

  private async getEngagementSummary(userId: number) {
    const contracts = await this.getSharedContractIds(userId);
    const contractIds = contracts.map((c) => c.id);

    const [openTasks, activeConversations, unreadNotifications] =
      await Promise.all([
        contractIds.length
          ? this.prisma.contractTask.count({
              where: { contractId: { in: contractIds }, status: 'OPEN' },
            })
          : Promise.resolve(0),
        this.prisma.conversationParticipant.count({
          where: { userId, conversation: { directKey: { not: null } } },
        }),
        this.prisma.notification.count({
          where: { userId, read: false },
        }),
      ]);

    return { openTasks, activeConversations, unreadNotifications };
  }

  async getStats(userId: number, role: string) {
    if (role === 'CLIENT') return this.getClientStats(userId);
    if (role === 'FREELANCER') return this.getFreelancerStats(userId);
    throw new ForbiddenException('Dashboard stats are not available for this role');
  }

  private async getClientStats(userId: number) {
    const grouped = await this.prisma.job.groupBy({
      by: ['status'],
      where: { clientId: userId },
      _count: { _all: true },
    });
    const count = (status: JobStatus) =>
      grouped.find((g) => g.status === status)?._count._all ?? 0;

    const open = count('OPEN');
    const inProgress = count('IN_PROGRESS');
    const completed = count('COMPLETED');
    const cancelled = count('CANCELLED');

    const segments = this.toSegments([
      {
        key: 'backlog',
        label: 'Backlog',
        count: open,
        color: '#f97316',
        description: 'Open listings accepting bids',
      },
      {
        key: 'blocked',
        label: 'Blocked',
        count: cancelled,
        color: '#ef4444',
        description: 'Cancelled projects',
      },
      {
        key: 'deployed',
        label: 'Deployed',
        count: completed,
        color: '#22c55e',
        description: 'Completed projects',
      },
      {
        key: 'in_development',
        label: 'In Development',
        count: inProgress,
        color: '#3b82f6',
        description: 'Projects with work in progress',
      },
    ]);

    const contracts = await this.prisma.contract.groupBy({
      by: ['status'],
      where: { clientId: userId },
      _count: { _all: true },
    });

    const pendingApplicants = await this.prisma.bid.count({
      where: {
        status: 'PENDING',
        job: { clientId: userId, status: 'OPEN' },
      },
    });

    const budgetAgg = await this.prisma.job.aggregate({
      where: { clientId: userId, status: 'OPEN' },
      _sum: { budget: true },
    });

    const engagement = await this.getEngagementSummary(userId);
    const activity = await this.getActivity(userId);

    return {
      role: 'CLIENT' as const,
      generatedAt: new Date().toISOString(),
      segments,
      summary: {
        totalProjects: open + inProgress + completed + cancelled,
        openListings: open,
        inProgress,
        completed,
        cancelled,
        pendingApplicants,
        openListingsBudget: budgetAgg._sum.budget ?? 0,
        activeContracts:
          contracts.find((c) => c.status === 'ACTIVE')?._count._all ?? 0,
        pendingContracts:
          contracts.find((c) => c.status === 'PENDING_START')?._count._all ?? 0,
        completedContracts:
          contracts.find((c) => c.status === 'COMPLETED')?._count._all ?? 0,
        openTasks: engagement.openTasks,
        activeConversations: engagement.activeConversations,
        unreadNotifications: engagement.unreadNotifications,
      },
      activity,
    };
  }

  private async getFreelancerStats(userId: number) {
    const myBids = await this.prisma.bid.findMany({
      where: { freelancerId: userId },
      select: { jobId: true, status: true },
    });
    const uniqueApplications = new Set(myBids.map((b) => b.jobId)).size;

    const bidGrouped = await this.prisma.bid.groupBy({
      by: ['status'],
      where: { freelancerId: userId },
      _count: { _all: true },
    });
    const bidCount = (status: BidStatus) =>
      bidGrouped.find((g) => g.status === status)?._count._all ?? 0;

    const pending = bidCount('PENDING');
    const accepted = bidCount('ACCEPTED');
    const rejected = bidCount('REJECTED');

    const contractGrouped = await this.prisma.contract.groupBy({
      by: ['status'],
      where: { freelancerId: userId },
      _count: { _all: true },
    });
    const contractCount = (status: ContractStatus) =>
      contractGrouped.find((g) => g.status === status)?._count._all ?? 0;

    const active = contractCount('ACTIVE');
    const pendingStart = contractCount('PENDING_START');

    const segments = this.toSegments([
      {
        key: 'pending',
        label: 'Pending',
        count: pending,
        color: '#f97316',
        description: 'Bids awaiting client review',
      },
      {
        key: 'declined',
        label: 'Declined',
        count: rejected,
        color: '#ef4444',
        description: 'Bids not selected',
      },
      {
        key: 'completed',
        label: 'Completed',
        count: contractCount('COMPLETED'),
        color: '#22c55e',
        description: 'Finished contracts',
      },
      {
        key: 'active',
        label: 'In progress',
        count: active + pendingStart,
        color: '#3b82f6',
        description: 'Active or pending-start contracts',
      },
    ]);

    const openMarketplaceJobs = await this.prisma.job.count({
      where: { status: 'OPEN' },
    });

    const resolved = accepted + rejected;
    const winRate =
      resolved > 0 ? Math.round((accepted / resolved) * 100) : 0;

    const engagement = await this.getEngagementSummary(userId);
    const activity = await this.getActivity(userId);

    return {
      role: 'FREELANCER' as const,
      generatedAt: new Date().toISOString(),
      segments,
      summary: {
        totalBids: pending + accepted + rejected,
        uniqueApplications,
        pendingBids: pending,
        acceptedBids: accepted,
        rejectedBids: rejected,
        activeContracts: active,
        pendingContracts: pendingStart,
        completedContracts: contractCount('COMPLETED'),
        openMarketplaceJobs,
        winRate,
        openTasks: engagement.openTasks,
        activeConversations: engagement.activeConversations,
        unreadNotifications: engagement.unreadNotifications,
      },
      activity,
    };
  }
}
