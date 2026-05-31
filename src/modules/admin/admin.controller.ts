import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/role.guard';
import { Roles } from '../auth/role.decorator';
import { Role } from '../../enums/user.enums';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('/stats')
  getStats() {
    return this.adminService.getStats();
  }

  @Get('/users')
  listUsers(
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.listUsers({
      search,
      role,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Post('/users')
  createUser(
    @Body()
    body: {
      email: string;
      username: string;
      password: string;
      role: 'ADMIN' | 'FREELANCER' | 'CLIENT';
    },
  ) {
    return this.adminService.createUser(body);
  }

  @Patch('/users/:id')
  updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { role?: string; coinBalance?: number },
  ) {
    return this.adminService.updateUser(id, body);
  }

  @Post('/users/:id/grant-coins')
  grantCoins(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { amount: number },
    @Req() req: { user: { userId: number } },
  ) {
    return this.adminService.grantCoins(id, body.amount, req.user.userId);
  }

  @Delete('/users/:id')
  deleteUser(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.deleteUser(id);
  }
}
