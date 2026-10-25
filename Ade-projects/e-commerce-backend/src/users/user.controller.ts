import {
  Controller,
  Get,
  UseGuards,
  Post,
  Put,
  Body,
  Delete,
  Param,
  Patch,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { CurrentUser } from '../common/decorators/current-user.decorators';
import { UsersService } from './user.service';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enums/role.enum';
import { CreateUserDto } from './dto/create-user-dto';
import { UpdateUserDto } from './dto/update-user.dto';
import type { CurrentUserInterface } from '../common/interfaces/current-user.interface';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';
import { CreateAdminProfileDto } from './dto/create-adminProfile.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { uploadOptions } from '../aws/aws.multer-uploads';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // SECURITY FIX: this had no guard at all — any unauthenticated caller
  // on the internet could hit this and create a user account. Restricted
  // to admins, matching create-admin-profile below it. See
  // UsersService.create() for the other half of this fix (password
  // wasn't being hashed at all).
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  findAll() {
    return this.usersService.findAll();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  findById(@CurrentUser() user: CurrentUserInterface) {
    return this.usersService.findById(user.id);
  }

  @Get('getWithEmail')
  @UseGuards(JwtAuthGuard)
  findByEmail(@CurrentUser() user: CurrentUserInterface) {
    return this.usersService.findByEmail(user.email);
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentUser() user: CurrentUserInterface,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(user.id, dto);
  }

  @Delete()
  @UseGuards(JwtAuthGuard)
  remove(@CurrentUser() user: CurrentUserInterface) {
    return this.usersService.remove(user.id);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getUserProfile(@CurrentUser() user: CurrentUserInterface) {
    return this.usersService.getUserProfile(user.id);
  }

  @Patch('update-customer-profile')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('image', uploadOptions))
  async updateUserProfile(
    @CurrentUser() user: CurrentUserInterface,
    @Body() updateCustomerProfileDto: UpdateCustomerProfileDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    return this.usersService.updateCustomerProfile(
      user.id,
      updateCustomerProfileDto,
      image,
    );
  }

  @Post('create-admin-profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async createAdminProfile(
    @CurrentUser() user: CurrentUserInterface,
    @Body() createAdminProfileDto: CreateAdminProfileDto,
  ) {
    return this.usersService.createAdminProfile(user.id, createAdminProfileDto);
  }

  @Patch(':userId/deactivate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async deactivateUser(@Param('userId') userId: string) {
    return this.usersService.deactivateUser(userId);
  }
}
