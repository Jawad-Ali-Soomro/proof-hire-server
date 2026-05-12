import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private userService: UsersService) {}

  @Get('/all')
  async getAll() {
    const users = await this.userService.getAll();

    return {
      message: 'fetched registered users!',
      users,
    };
  }

  @Get('/:id')
  async getById(@Param('id') id: string) {
    const user = await this.userService.findById(Number(id));

    return {
      message: 'user fetched',
      user,
    };
  }
}