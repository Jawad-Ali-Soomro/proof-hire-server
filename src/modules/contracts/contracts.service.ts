import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContractStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../services/prisma.service';
import {
  buildMilestoneProgress,
  contractProgressFromMilestones,
  MilestoneProgressItem,
  normalizeMilestoneProgress,
} from './contract-milestones.util';
import { NotificationsService } from '../notifications/notifications.service';

const partySelect = {
  id: true,
  username: true,
  profile: { select: { fullName: true, avatar: true } },
} as const;

const jobSelect = {
  id: true,
  title: true,
  description: true,
  budget: true,
  requirements: true,
  paymentNotes: true,
  milestones: true,
  images: true,
  links: true,
  status: true,
  createdAt: true,
} as const;

@Injectable()
export class ContractsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async createFromAcceptedBid(
    tx: Prisma.TransactionClient,
    params: {
      jobId: number;
      clientId: number;
      freelancerId: number;
      bidId: number;
      bidAmount: number;
      jobMilestones: unknown;
    },
  ) {
    const existing = await tx.contract.findUnique({
      where: { jobId: params.jobId },
    });
    if (existing) return existing;

    const milestoneProgress = buildMilestoneProgress(
      params.jobMilestones,
      params.bidAmount,
    );

    return tx.contract.create({
      data: {
        jobId: params.jobId,
        clientId: params.clientId,
        freelancerId: params.freelancerId,
        acceptedBidId: params.bidId,
        acceptedBidAmount: params.bidAmount,
        milestoneProgress: milestoneProgress as unknown as object,
        status: ContractStatus.PENDING_START,
      },
    });
  }

  async listForUser(userId: number, role: string) {
    const where =
      role === 'CLIENT'
        ? { clientId: userId }
        : role === 'FREELANCER'
          ? { freelancerId: userId }
          : null;
    if (!where) throw new ForbiddenException('Invalid role');

    const rows = await this.prisma.contract.findMany({
      where: {
        ...where,
        completedProject: null,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        job: { select: { id: true, title: true, description: true, budget: true } },
        client: { select: partySelect },
        freelancer: { select: partySelect },
        completedProject: { select: { id: true } },
      },
    });

    return rows.map((c) => this.toApiContract(c));
  }

  async getOne(contractId: number, userId: number, role: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        job: { select: jobSelect },
        client: { select: partySelect },
        freelancer: { select: partySelect },
        completedProject: { select: { id: true } },
      },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.clientId !== userId && contract.freelancerId !== userId) {
      throw new ForbiddenException('You do not have access to this contract');
    }
    if (role !== 'CLIENT' && role !== 'FREELANCER' && role !== 'ADMIN') {
      throw new ForbiddenException('Invalid role');
    }
    return this.toApiContract(contract);
  }

  async startContract(contractId: number, userId: number, role: string) {
    if (role !== 'FREELANCER') {
      throw new ForbiddenException('Only the freelancer can start the contract');
    }
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.freelancerId !== userId) {
      throw new ForbiddenException('You are not the freelancer on this contract');
    }
    if (contract.status === ContractStatus.COMPLETED) {
      throw new BadRequestException('Contract is already completed');
    }
    if (contract.status === ContractStatus.TERMINATED) {
      throw new BadRequestException('Contract is terminated');
    }
    if (contract.status === ContractStatus.ACTIVE) {
      return this.getOne(contractId, userId, role);
    }

    const updated = await this.prisma.contract.update({
      where: { id: contractId },
      data: { status: ContractStatus.ACTIVE },
      include: {
        job: { select: { title: true } },
        freelancer: {
          select: {
            username: true,
            profile: { select: { fullName: true } },
          },
        },
      },
    });
    await this.prisma.job.update({
      where: { id: updated.jobId },
      data: { status: 'IN_PROGRESS' },
    });
    const freelancerName =
      updated.freelancer.profile?.fullName?.trim() ||
      updated.freelancer.username ||
      'Freelancer';
    await this.notifications.notifyContractStarted({
      clientId: updated.clientId,
      contractId: updated.id,
      jobTitle: updated.job.title,
      freelancerName,
    });
    return this.getOne(contractId, userId, role);
  }

  async updateMilestone(
    contractId: number,
    milestoneIndex: number,
    userId: number,
    role: string,
    body: { status?: string; completed?: boolean },
  ) {
    if (role !== 'FREELANCER') {
      throw new ForbiddenException('Only the freelancer can update milestones');
    }
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.freelancerId !== userId) {
      throw new ForbiddenException('You are not the freelancer on this contract');
    }
    if (contract.status === ContractStatus.PENDING_START) {
      throw new BadRequestException('Start the contract before updating milestones');
    }
    if (contract.status === ContractStatus.COMPLETED) {
      throw new BadRequestException('Contract is already completed');
    }
    if (contract.status === ContractStatus.TERMINATED) {
      throw new BadRequestException('Contract is terminated');
    }

    const milestones = normalizeMilestoneProgress(contract.milestoneProgress);
    const idx = milestones.findIndex((m) => m.index === milestoneIndex);
    if (idx < 0) throw new NotFoundException('Milestone not found');

    let nextStatus: MilestoneProgressItem['status'];
    if (typeof body.completed === 'boolean') {
      nextStatus = body.completed ? 'COMPLETED' : 'PENDING';
    } else {
      const s = String(body.status || '').toUpperCase();
      if (s === 'COMPLETED' || s === 'IN_PROGRESS' || s === 'PENDING') {
        nextStatus = s as MilestoneProgressItem['status'];
      } else {
        throw new BadRequestException(
          'status must be PENDING, IN_PROGRESS, or COMPLETED',
        );
      }
    }

    milestones[idx] = { ...milestones[idx], status: nextStatus };
    const progress = contractProgressFromMilestones(milestones);

    const updated = await this.prisma.contract.update({
      where: { id: contractId },
      data: {
        milestoneProgress: milestones as unknown as object,
        status: ContractStatus.ACTIVE,
      },
      include: { job: { select: { title: true } } },
    });

    if (nextStatus === 'COMPLETED') {
      await this.notifications.notifyMilestoneCompleted({
        clientId: updated.clientId,
        contractId: updated.id,
        jobTitle: updated.job.title,
        milestoneTitle: milestones[idx].title || `Milestone ${milestoneIndex + 1}`,
      });
    }

    return this.getOne(contractId, userId, role);
  }

  async markWorkComplete(contractId: number, userId: number, role: string) {
    const contract = await this.assertClosableContract(contractId, userId, role);

    const milestones = normalizeMilestoneProgress(contract.milestoneProgress);
    const progress = contractProgressFromMilestones(milestones);
    if (progress.total > 0 && !progress.allDone) {
      throw new BadRequestException(
        'Complete all milestones before marking the contract as done',
      );
    }

    if (contract.status === ContractStatus.COMPLETED) {
      await this.prisma.contract.update({
        where: { id: contractId },
        data: { status: ContractStatus.ACTIVE },
      });
    }

    const data =
      role === 'CLIENT'
        ? { clientMarkedComplete: true }
        : role === 'FREELANCER'
          ? { freelancerMarkedComplete: true }
          : null;
    if (!data) throw new ForbiddenException('Invalid role');

    await this.prisma.contract.update({
      where: { id: contractId },
      data,
    });

    const recipientId =
      role === 'CLIENT' ? contract.freelancerId : contract.clientId;
    await this.notifications.notifyWorkMarkedComplete({
      recipientId,
      contractId,
      jobTitle: contract.job?.title ?? 'Project',
      byRole: role as 'CLIENT' | 'FREELANCER',
    });

    return this.getOne(contractId, userId, role);
  }

  async confirmPaymentSent(contractId: number, userId: number, role: string) {
    if (role !== 'CLIENT') {
      throw new ForbiddenException('Only the client can confirm payment sent');
    }
    const contract = await this.assertClosableContract(contractId, userId, role);
    this.assertBothMarkedComplete(contract);
    if (contract.clientPaymentSent) {
      return this.getOne(contractId, userId, role);
    }

    await this.prisma.contract.update({
      where: { id: contractId },
      data: {
        clientPaymentSent: true,
        ...(contract.status === ContractStatus.COMPLETED
          ? { status: ContractStatus.ACTIVE }
          : {}),
      },
    });

    await this.notifications.notifyPaymentSent({
      freelancerId: contract.freelancerId,
      contractId,
      jobTitle: contract.job.title,
    });

    await this.tryFinalizeContract(contractId);
    return this.getOne(contractId, userId, role);
  }

  async confirmPaymentReceived(contractId: number, userId: number, role: string) {
    if (role !== 'FREELANCER') {
      throw new ForbiddenException('Only the freelancer can confirm payment received');
    }
    const contract = await this.assertClosableContract(contractId, userId, role);
    this.assertBothMarkedComplete(contract);
    if (contract.freelancerPaymentReceived) {
      return this.getOne(contractId, userId, role);
    }

    await this.prisma.contract.update({
      where: { id: contractId },
      data: {
        freelancerPaymentReceived: true,
        ...(contract.status === ContractStatus.COMPLETED
          ? { status: ContractStatus.ACTIVE }
          : {}),
      },
    });

    await this.notifications.notifyPaymentReceived({
      clientId: contract.clientId,
      contractId,
      jobTitle: contract.job.title,
    });

    await this.tryFinalizeContract(contractId);
    return this.getOne(contractId, userId, role);
  }

  async listHistoryForUser(userId: number, role: string) {
    const contractWhere =
      role === 'CLIENT'
        ? { clientId: userId }
        : role === 'FREELANCER'
          ? { freelancerId: userId }
          : null;
    if (!contractWhere) throw new ForbiddenException('Invalid role');

    const items: Array<Record<string, unknown>> = [];

    const completedRows = await this.prisma.completedProject.findMany({
      where: contractWhere,
      orderBy: { completedAt: 'desc' },
      include: {
        contract: {
          include: {
            job: { select: jobSelect },
            client: { select: partySelect },
            freelancer: { select: partySelect },
            completedProject: { select: { id: true } },
          },
        },
      },
    });

    for (const row of completedRows) {
      items.push({
        ...this.toApiContract(row.contract),
        historyKind: 'COMPLETED',
        completedAt: row.completedAt,
        historyRecordId: row.id,
        jobId: row.contract.jobId,
      });
    }

    if (role === 'CLIENT') {
      const client = await this.prisma.user.findUnique({
        where: { id: userId },
        select: partySelect,
      });

      const cancelledJobs = await this.prisma.job.findMany({
        where: { clientId: userId, status: 'CANCELLED' },
        orderBy: { updatedAt: 'desc' },
        include: {
          _count: { select: { bids: true } },
          contract: {
            include: {
              freelancer: { select: partySelect },
            },
          },
        },
      });

      for (const job of cancelledJobs) {
        items.push({
          historyKind: 'CANCELLED',
          id: job.contract?.id ?? null,
          jobId: job.id,
          status: 'CANCELLED',
          job: {
            id: job.id,
            title: job.title,
            description: job.description,
            budget: job.budget,
            requirements: job.requirements,
            paymentNotes: job.paymentNotes,
            milestones: job.milestones,
            images: job.images,
            status: job.status,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
          },
          title: job.title,
          acceptedBidAmount: job.contract?.acceptedBidAmount ?? job.budget,
          client,
          freelancer: job.contract?.freelancer ?? null,
          completedAt: job.updatedAt,
          progress: { completed: 0, total: 0, allDone: false },
          milestones: [],
        });
      }
    }

    items.sort(
      (a, b) =>
        new Date(String(b.completedAt)).getTime() -
        new Date(String(a.completedAt)).getTime(),
    );

    return items;
  }

  private async assertClosableContract(
    contractId: number,
    userId: number,
    role: string,
  ) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        job: { select: jobSelect },
        completedProject: { select: { id: true } },
      },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.clientId !== userId && contract.freelancerId !== userId) {
      throw new ForbiddenException('You do not have access to this contract');
    }
    if (role !== 'CLIENT' && role !== 'FREELANCER' && role !== 'ADMIN') {
      throw new ForbiddenException('Invalid role');
    }
    if (contract.status === ContractStatus.TERMINATED) {
      throw new BadRequestException('Contract is terminated');
    }
    if (contract.status === ContractStatus.PENDING_START) {
      throw new BadRequestException('Start the contract before closing it');
    }
    if (contract.completedProject) {
      throw new BadRequestException('Contract is already finalized');
    }
    return contract;
  }

  private assertBothMarkedComplete(contract: {
    clientMarkedComplete: boolean;
    freelancerMarkedComplete: boolean;
  }) {
    if (!contract.clientMarkedComplete || !contract.freelancerMarkedComplete) {
      throw new BadRequestException(
        'Both client and freelancer must mark the contract as complete before payment',
      );
    }
  }

  private async tryFinalizeContract(contractId: number) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { job: { select: jobSelect }, completedProject: true },
    });
    if (!contract) return;
    if (
      !contract.clientMarkedComplete ||
      !contract.freelancerMarkedComplete ||
      !contract.clientPaymentSent ||
      !contract.freelancerPaymentReceived
    ) {
      return;
    }
    if (contract.completedProject) return;

    const year = String(new Date().getFullYear());
    const profileEntry = {
      title: contract.job.title,
      description: contract.job.description?.slice(0, 2000) ?? '',
      year,
      github: '',
      blog: '',
      images: [] as string[],
      contractId: contract.id,
      jobId: contract.jobId,
      proofHireCompleted: true,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.contract.update({
        where: { id: contractId },
        data: { status: ContractStatus.COMPLETED },
      });
      await tx.job.update({
        where: { id: contract.jobId },
        data: { status: 'COMPLETED' },
      });
      await tx.completedProject.create({
        data: {
          contractId: contract.id,
          jobId: contract.jobId,
          title: contract.job.title,
          description: contract.job.description,
          amount: contract.acceptedBidAmount ?? contract.job.budget,
          clientId: contract.clientId,
          freelancerId: contract.freelancerId,
        },
      });

      for (const userId of [contract.clientId, contract.freelancerId]) {
        const profile = await tx.profile.findUnique({ where: { userId } });
        const existing = Array.isArray(profile?.projects)
          ? (profile!.projects as object[])
          : [];
        const already = existing.some(
          (p) =>
            p &&
            typeof p === 'object' &&
            'contractId' in p &&
            (p as { contractId?: number }).contractId === contract.id,
        );
        if (!already) {
          await tx.profile.upsert({
            where: { userId },
            create: {
              userId,
              projects: [...existing, profileEntry] as Prisma.InputJsonValue,
            },
            update: {
              projects: [...existing, profileEntry] as Prisma.InputJsonValue,
            },
          });
        }
      }
    });

    for (const userId of [contract.clientId, contract.freelancerId]) {
      await this.notifications.notifyContractFinalized({
        userId,
        contractId,
        jobTitle: contract.job.title,
      });
    }
  }

  /** API shape for contract + job + parties (used by contracts list/detail and client project page). */
  toApiContract(contract: {
    id: number;
    status: ContractStatus;
    jobId: number;
    clientId: number;
    freelancerId: number;
    acceptedBidId: number | null;
    acceptedBidAmount: number | null;
    milestoneProgress: unknown;
    clientMarkedComplete: boolean;
    freelancerMarkedComplete: boolean;
    clientPaymentSent: boolean;
    freelancerPaymentReceived: boolean;
    createdAt: Date;
    updatedAt: Date;
    job: {
      id: number;
      title: string;
      description: string;
      budget: number;
      requirements?: string | null;
      paymentNotes?: string | null;
      milestones?: unknown;
      images?: unknown;
      links?: unknown;
      status?: string;
      createdAt?: Date;
    };
    client: {
      id: number;
      username: string;
      profile: { fullName: string | null; avatar: string | null } | null;
    };
    freelancer: {
      id: number;
      username: string;
      profile: { fullName: string | null; avatar: string | null } | null;
    };
    completedProject?: { id: number } | null;
  }) {
    const milestones = normalizeMilestoneProgress(contract.milestoneProgress);
    const progress = contractProgressFromMilestones(milestones);
    const bothMarkedComplete =
      contract.clientMarkedComplete && contract.freelancerMarkedComplete;
    const bothPaymentConfirmed =
      contract.clientPaymentSent && contract.freelancerPaymentReceived;

    return {
      ...contract,
      milestones,
      progress,
      closure: {
        clientMarkedComplete: contract.clientMarkedComplete,
        freelancerMarkedComplete: contract.freelancerMarkedComplete,
        clientPaymentSent: contract.clientPaymentSent,
        freelancerPaymentReceived: contract.freelancerPaymentReceived,
        bothMarkedComplete,
        awaitingPayment: bothMarkedComplete && !bothPaymentConfirmed,
        bothPaymentConfirmed,
        finalized: Boolean(contract.completedProject),
      },
    };
  }
}
