import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../services/prisma.service';

const MAX_MILESTONES = 24;

@Injectable()
export class JobsService {
  constructor(private prisma: PrismaService) {}

  private assertClient(role: string) {
    if (role !== 'CLIENT') {
      throw new ForbiddenException('Only clients can perform this action');
    }
  }

  private assertFreelancer(role: string) {
    if (role !== 'FREELANCER') {
      throw new ForbiddenException('Only freelancers can place bids');
    }
  }

  private normalizeMilestones(raw: unknown): Record<string, unknown>[] | null {
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const out: Record<string, unknown>[] = [];
    const slice = raw.slice(0, MAX_MILESTONES);
    for (let i = 0; i < slice.length; i++) {
      const item = slice[i];
      if (!item || typeof item !== 'object') {
        throw new BadRequestException(`Invalid milestone at index ${i}`);
      }
      const o = item as Record<string, unknown>;
      const title = typeof o.title === 'string' ? o.title.trim() : '';
      if (!title) {
        throw new BadRequestException(`Milestone ${i + 1} needs a title`);
      }
      const description =
        typeof o.description === 'string' ? o.description.trim() : '';
      const dueDate = typeof o.dueDate === 'string' ? o.dueDate.trim() : '';
      let amount: number | undefined;
      if (o.amount !== undefined && o.amount !== null && o.amount !== '') {
        const n = Number(o.amount);
        if (!Number.isFinite(n) || n < 0) {
          throw new BadRequestException(`Invalid amount on milestone ${i + 1}`);
        }
        amount = n;
      }
      out.push({
        title,
        ...(description ? { description } : {}),
        ...(dueDate ? { dueDate } : {}),
        ...(amount !== undefined ? { amount } : {}),
      });
    }
    return out.length ? out : null;
  }

  async create(
    userId: number,
    role: string,
    body: {
      title: string;
      description: string;
      budget: number;
      requirements?: string;
      paymentNotes?: string;
      milestones?: unknown;
    },
  ) {
    this.assertClient(role);
    const title = body.title?.trim();
    const description = body.description?.trim();
    if (!title) throw new BadRequestException('Title is required');
    if (!description) throw new BadRequestException('Description is required');
    const budget = Number(body.budget);
    if (!Number.isFinite(budget) || budget <= 0) {
      throw new BadRequestException('Budget must be a positive number');
    }
    const requirements = body.requirements?.trim() || null;
    const paymentNotes = body.paymentNotes?.trim() || null;
    const milestones = this.normalizeMilestones(body.milestones);
    const milestoneJson = milestones
      ? (milestones as unknown as Prisma.InputJsonValue)
      : undefined;

    return this.prisma.job.create({
      data: {
        title,
        description,
        budget,
        requirements,
        paymentNotes,
        ...(milestoneJson !== undefined ? { milestones: milestoneJson } : {}),
        clientId: userId,
      },
      include: { _count: { select: { bids: true } } },
    });
  }

  async listMine(userId: number, role: string) {
    this.assertClient(role);
    return this.prisma.job.findMany({
      where: { clientId: userId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { bids: true } } },
    });
  }

  async getOneForClient(jobId: number, userId: number, role: string) {
    this.assertClient(role);
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, clientId: userId },
      include: {
        bids: {
          orderBy: { createdAt: 'desc' },
          include: {
            freelancer: {
              select: {
                id: true,
                username: true,
                profile: { select: { fullName: true, avatar: true } },
              },
            },
          },
        },
      },
    });
    if (!job) throw new NotFoundException('Project not found');
    return job;
  }

  async submitBid(
    jobId: number,
    userId: number,
    role: string,
    body: { amount: number; message: string },
  ) {
    this.assertFreelancer(role);
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');
    if (job.status !== 'OPEN') {
      throw new BadRequestException('This project is not accepting bids');
    }
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Bid amount must be positive');
    }
    const message = body.message?.trim();
    if (!message) throw new BadRequestException('Message is required');

    try {
      return await this.prisma.bid.create({
        data: {
          jobId,
          freelancerId: userId,
          amount,
          message,
        },
        include: {
          freelancer: {
            select: {
              id: true,
              username: true,
              profile: { select: { fullName: true, avatar: true } },
            },
          },
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('You already submitted a bid on this job');
      }
      throw e;
    }
  }

  async setBidStatus(
    bidId: number,
    userId: number,
    role: string,
    status: 'ACCEPTED' | 'REJECTED',
  ) {
    this.assertClient(role);
    const bid = await this.prisma.bid.findUnique({
      where: { id: bidId },
      include: { job: true },
    });
    if (!bid) throw new NotFoundException('Bid not found');
    if (bid.job.clientId !== userId) {
      throw new ForbiddenException('You do not manage this project');
    }
    if (bid.status !== 'PENDING') {
      throw new BadRequestException('This bid was already resolved');
    }

    if (status === 'REJECTED') {
      return this.prisma.bid.update({
        where: { id: bidId },
        data: { status: 'REJECTED' },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.bid.update({
        where: { id: bidId },
        data: { status: 'ACCEPTED' },
      });
      await tx.bid.updateMany({
        where: {
          jobId: bid.jobId,
          id: { not: bidId },
          status: 'PENDING',
        },
        data: { status: 'REJECTED' },
      });
      await tx.job.update({
        where: { id: bid.jobId },
        data: { status: 'IN_PROGRESS' },
      });
    });

    return this.prisma.bid.findUnique({ where: { id: bidId } });
  }
}
