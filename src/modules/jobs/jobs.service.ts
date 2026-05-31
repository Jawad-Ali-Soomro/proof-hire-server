import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Bid, Prisma } from '@prisma/client';
import { PrismaService } from '../../services/prisma.service';
import { ContractsService } from '../contracts/contracts.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ChatService } from '../chat/chat.service';
import { CoinsService } from '../coins/coins.service';

const MAX_MILESTONES = 24;
const MAX_JOB_IMAGES = 24;
const MAX_JOB_LINKS = 24;

@Injectable()
export class JobsService {
  constructor(
    private prisma: PrismaService,
    private contractsService: ContractsService,
    private notifications: NotificationsService,
    private chatService: ChatService,
    private coinsService: CoinsService,
  ) {}

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

  private normalizeUrlArray(raw: unknown, max = MAX_JOB_IMAGES): string[] {
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const item of raw) {
      if (typeof item !== 'string') continue;
      const u = item.trim();
      if (u) out.push(u);
      if (out.length >= max) break;
    }
    return out;
  }

  private normalizeLinks(raw: unknown, max = MAX_JOB_LINKS): { title: string; url: string }[] {
    if (!Array.isArray(raw)) return [];
    const out: { title: string; url: string }[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const title = typeof row.title === 'string' ? row.title.trim() : '';
      let url = typeof row.url === 'string' ? row.url.trim() : '';
      if (!title || !url) continue;
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      try {
        new URL(url);
      } catch {
        continue;
      }
      out.push({ title, url });
      if (out.length >= max) break;
    }
    return out;
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
      const images = this.normalizeUrlArray(o.images, MAX_JOB_IMAGES);
      const links = this.normalizeLinks(o.links, MAX_JOB_LINKS);
      out.push({
        title,
        ...(description ? { description } : {}),
        ...(dueDate ? { dueDate } : {}),
        ...(amount !== undefined ? { amount } : {}),
        ...(images.length ? { images } : {}),
        ...(links.length ? { links } : {}),
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
      images?: unknown;
      links?: unknown;
      bidCost?: number;
    },
  ) {
    this.assertClient(role);

    // Wallet gating for posting
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });
    if (!wallet) {
      throw new ForbiddenException(
        'You must connect a wallet before posting projects',
      );
    }

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
    const jobImages = this.normalizeUrlArray(body.images);
    const jobLinks = this.normalizeLinks(body.links);
    const imagesJson = jobImages.length
      ? (jobImages as unknown as Prisma.InputJsonValue)
      : undefined;
    const linksJson = jobLinks.length
      ? (jobLinks as unknown as Prisma.InputJsonValue)
      : undefined;

    const bidCost = Math.max(
      10,
      Math.min(100, Math.round(Number(body.bidCost) || 10)),
    );

    return this.prisma.job.create({
      data: {
        title,
        description,
        budget,
        requirements,
        paymentNotes,
        bidCost,
        ...(milestoneJson !== undefined ? { milestones: milestoneJson } : {}),
        ...(imagesJson !== undefined ? { images: imagesJson } : {}),
        ...(linksJson !== undefined ? { links: linksJson } : {}),
        clientId: userId,
      },
      include: { _count: { select: { bids: true } } },
    });
  }

  async listMine(userId: number, role: string) {
    this.assertClient(role);
    return this.prisma.job.findMany({
      where: {
        clientId: userId,
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { bids: true } } },
    });
  }

  /** Public marketplace: open jobs the viewer has not already bid on. */
  async listOpenJobs(viewerId: number | null, viewerRole: string | null) {
    const where: Prisma.JobWhereInput = { status: 'OPEN' };
    if (viewerRole === 'FREELANCER' && viewerId) {
      where.bids = { none: { freelancerId: viewerId } };
    }
    return this.prisma.job.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        client: {
          select: {
            username: true,
            profile: { select: { fullName: true } },
          },
        },
        _count: { select: { bids: true } },
      },
    });
  }

  async listMyBids(userId: number, role: string) {
    this.assertFreelancer(role);
    return this.prisma.bid.findMany({
      where: {
        freelancerId: userId,
        // Accepted bids with an initialized contract live under Contracts, not My bids.
        NOT: {
          status: 'ACCEPTED',
          job: { contract: { freelancerId: userId } },
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        job: {
          include: {
            client: {
              select: {
                id: true,
                username: true,
                profile: { select: { fullName: true, avatar: true } },
              },
            },
            contract: {
              select: { id: true, status: true, freelancerId: true },
            },
            _count: { select: { bids: true } },
          },
        },
      },
    });
  }

  async getMyBid(bidId: number, userId: number, role: string) {
    this.assertFreelancer(role);
    const bid = await this.prisma.bid.findFirst({
      where: { id: bidId, freelancerId: userId },
      include: {
        job: {
          include: {
            client: {
              select: {
                id: true,
                username: true,
                profile: { select: { fullName: true, avatar: true } },
              },
            },
            contract: {
              select: { id: true, status: true, freelancerId: true },
            },
            _count: { select: { bids: true } },
          },
        },
      },
    });
    if (!bid) throw new NotFoundException('Bid not found');
    const contract = bid.job?.contract;
    if (
      bid.status === 'ACCEPTED' &&
      contract &&
      contract.freelancerId === userId
    ) {
      throw new NotFoundException(
        'This proposal is now a contract. Open Contracts to continue.',
      );
    }
    return bid;
  }

  /** Single open job for marketplace / drawer; includes viewer's bid if freelancer. */
  async getOpenJob(
    jobId: number,
    viewerId: number | null,
    viewerRole: string | null,
  ) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, status: 'OPEN' },
      include: {
        client: {
          select: {
            id: true,
            username: true,
            profile: { select: { fullName: true, avatar: true } },
          },
        },
        _count: { select: { bids: true } },
      },
    });
    if (!job) throw new NotFoundException('Job not found or no longer open');

    let myBid: Bid | null = null;
    if (viewerRole === 'FREELANCER' && viewerId) {
      myBid = await this.prisma.bid.findUnique({
        where: {
          jobId_freelancerId: { jobId, freelancerId: viewerId },
        },
      });
    }

    return { ...job, myBid };
  }

  /** Update listing fields; only the creating client, while status is OPEN. */
  async updateAsOwner(
    jobId: number,
    userId: number,
    role: string,
    body: {
      title: string;
      description: string;
      budget: number;
      requirements?: string;
      paymentNotes?: string;
      milestones?: unknown;
      images?: unknown;
      links?: unknown;
    },
  ) {
    this.assertClient(role);
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, clientId: userId },
    });
    if (!job) throw new NotFoundException('Project not found');
    if (job.status !== 'OPEN') {
      throw new BadRequestException(
        'Only open listings can be edited. Use the contract workspace after you hire someone.',
      );
    }

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
      : Prisma.JsonNull;
    const jobImages = this.normalizeUrlArray(body.images);
    const jobLinks = this.normalizeLinks(body.links);
    const imagesJson = jobImages.length
      ? (jobImages as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull;
    const linksJson = jobLinks.length
      ? (jobLinks as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull;

    return this.prisma.job.update({
      where: { id: jobId },
      data: {
        title,
        description,
        budget,
        requirements,
        paymentNotes,
        milestones: milestoneJson,
        images: imagesJson,
        links: linksJson,
      },
      include: { _count: { select: { bids: true } } },
    });
  }

  /** Client closes a listing (inactivate / cancel). Allowed from OPEN or IN_PROGRESS. */
  async cancelJobAsClient(jobId: number, userId: number, role: string) {
    this.assertClient(role);
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, clientId: userId },
    });
    if (!job) throw new NotFoundException('Project not found');
    if (job.status === 'COMPLETED' || job.status === 'CANCELLED') {
      throw new BadRequestException('This project is already finished or cancelled');
    }
    return this.prisma.job.update({
      where: { id: jobId },
      data: { status: 'CANCELLED' },
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
        contract: {
          include: {
            client: {
              select: {
                id: true,
                username: true,
                profile: { select: { fullName: true, avatar: true } },
              },
            },
            freelancer: {
              select: {
                id: true,
                username: true,
                profile: { select: { fullName: true, avatar: true } },
              },
            },
            completedProject: { select: { id: true } },
          },
        },
      },
    });
    if (!job) throw new NotFoundException('Project not found');

    const { contract: contractRow, ...jobFields } = job;
    const contract = contractRow
      ? this.contractsService.toApiContract({
          ...contractRow,
          job: {
            id: jobFields.id,
            title: jobFields.title,
            description: jobFields.description,
            budget: jobFields.budget,
            requirements: jobFields.requirements,
            paymentNotes: jobFields.paymentNotes,
            milestones: jobFields.milestones,
            links: jobFields.links,
            images: jobFields.images,
            status: jobFields.status,
            createdAt: jobFields.createdAt,
          },
        })
      : null;

    return { ...jobFields, bids: job.bids, contract };
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

    // Wallet gating
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });
    if (!wallet) {
      throw new ForbiddenException(
        'You must connect a wallet before bidding on projects',
      );
    }

    // Coin deduction
    await this.coinsService.deductForBid(userId, jobId, job.bidCost);

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Bid amount must be positive');
    }
    const message = body.message?.trim();
    if (!message) throw new BadRequestException('Message is required');

    try {
      const bid = await this.prisma.bid.create({
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
      const freelancerName =
        bid.freelancer.profile?.fullName?.trim() ||
        bid.freelancer.username ||
        'A freelancer';
      await this.notifications.notifyBidReceived({
        clientId: job.clientId,
        jobId: job.id,
        jobTitle: job.title,
        freelancerName,
        bidId: bid.id,
        amount: bid.amount,
      });
      return bid;
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
      const updated = await this.prisma.bid.update({
        where: { id: bidId },
        data: { status: 'REJECTED' },
      });
      await this.notifications.notifyBidRejected({
        freelancerId: bid.freelancerId,
        jobId: bid.jobId,
        jobTitle: bid.job.title,
      });
      return updated;
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
      const jobRow = await tx.job.findUnique({ where: { id: bid.jobId } });
      await this.contractsService.createFromAcceptedBid(tx, {
        jobId: bid.jobId,
        clientId: bid.job.clientId,
        freelancerId: bid.freelancerId,
        bidId: bid.id,
        bidAmount: bid.amount,
        jobMilestones: jobRow?.milestones,
      });
    });

    const contract = await this.prisma.contract.findUnique({
      where: { jobId: bid.jobId },
    });
    if (contract) {
      await this.chatService.ensureConversationForContract(contract.id);
      await this.notifications.notifyBidAccepted({
        freelancerId: bid.freelancerId,
        jobId: bid.jobId,
        jobTitle: bid.job.title,
        contractId: contract.id,
      });
    }

    return this.prisma.bid.findUnique({ where: { id: bidId } });
  }
}
