import {
  BadRequestException,
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
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private jobsService: JobsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Req() req: { user: { userId: number; role: string } },
    @Body()
    body: {
      title: string;
      description: string;
      budget: number;
      requirements?: string;
      paymentNotes?: string;
      milestones?: unknown;
    },
  ) {
    return this.jobsService.create(req.user.userId, req.user.role, body);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  listMine(@Req() req: { user: { userId: number; role: string } }) {
    return this.jobsService.listMine(req.user.userId, req.user.role);
  }

  @Get('open')
  @UseGuards(JwtAuthGuard)
  listOpenJobs(@Req() req: { user: { userId: number; role: string } }) {
    return this.jobsService.listOpenJobs(req.user.userId, req.user.role);
  }

  @Get('bids/mine')
  @UseGuards(JwtAuthGuard)
  listMyBids(@Req() req: { user: { userId: number; role: string } }) {
    return this.jobsService.listMyBids(req.user.userId, req.user.role);
  }

  @Get('bids/:bidId')
  @UseGuards(JwtAuthGuard)
  getMyBid(
    @Req() req: { user: { userId: number; role: string } },
    @Param('bidId', ParseIntPipe) bidId: number,
  ) {
    return this.jobsService.getMyBid(bidId, req.user.userId, req.user.role);
  }

  @Get('open/:jobId')
  @UseGuards(JwtAuthGuard)
  getOpenJob(
    @Req() req: { user: { userId: number; role: string } },
    @Param('jobId', ParseIntPipe) jobId: number,
  ) {
    return this.jobsService.getOpenJob(
      jobId,
      req.user.userId,
      req.user.role,
    );
  }

  @Patch('bids/:bidId')
  @UseGuards(JwtAuthGuard)
  setBidStatus(
    @Req() req: { user: { userId: number; role: string } },
    @Param('bidId', ParseIntPipe) bidId: number,
    @Body() body: { status: 'ACCEPTED' | 'REJECTED' },
  ) {
    if (body.status !== 'ACCEPTED' && body.status !== 'REJECTED') {
      throw new BadRequestException('status must be ACCEPTED or REJECTED');
    }
    return this.jobsService.setBidStatus(
      bidId,
      req.user.userId,
      req.user.role,
      body.status,
    );
  }

  @Patch(':jobId')
  @UseGuards(JwtAuthGuard)
  updateJob(
    @Req() req: { user: { userId: number; role: string } },
    @Param('jobId', ParseIntPipe) jobId: number,
    @Body()
    body: {
      status?: string;
      title?: string;
      description?: string;
      budget?: number;
      requirements?: string;
      paymentNotes?: string;
      milestones?: unknown;
      images?: unknown;
      links?: unknown;
    },
  ) {
    if (body?.status === 'CANCELLED') {
      return this.jobsService.cancelJobAsClient(
        jobId,
        req.user.userId,
        req.user.role,
      );
    }
    if (typeof body?.title === 'string' && typeof body?.description === 'string') {
      return this.jobsService.updateAsOwner(
        jobId,
        req.user.userId,
        req.user.role,
        body as {
          title: string;
          description: string;
          budget: number;
          requirements?: string;
          paymentNotes?: string;
          milestones?: unknown;
          images?: unknown;
          links?: unknown;
        },
      );
    }
    throw new BadRequestException(
      'Send status CANCELLED or a full project update (title, description, budget, …)',
    );
  }

  @Post(':jobId/bids')
  @UseGuards(JwtAuthGuard)
  submitBid(
    @Req() req: { user: { userId: number; role: string } },
    @Param('jobId', ParseIntPipe) jobId: number,
    @Body() body: { amount: number; message: string },
  ) {
    return this.jobsService.submitBid(jobId, req.user.userId, req.user.role, body);
  }

  @Get(':jobId')
  @UseGuards(JwtAuthGuard)
  getOne(
    @Req() req: { user: { userId: number; role: string } },
    @Param('jobId', ParseIntPipe) jobId: number,
  ) {
    return this.jobsService.getOneForClient(jobId, req.user.userId, req.user.role);
  }
}
