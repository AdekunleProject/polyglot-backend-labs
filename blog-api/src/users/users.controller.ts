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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthUser } from '../auth/auth-user.type';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { uploadOptions } from '../aws/aws.multer-uploads';
import { Role } from '../common/enums/role.enum';
import { ReasonDto } from '../common/dto/reason.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserContentService } from './user-content.service';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly content: UserContentService,
  ) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.usersService.findById(user.id);
  }

  @Patch('me')
  @UseInterceptors(FileInterceptor('image', uploadOptions))
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    return this.usersService.updateProfile(user.id, dto, image);
  }

  @Post('me/change-password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.usersService.changePassword(user.id, dto);
  }

  @Delete('me')
  removeMe(@CurrentUser() user: AuthUser) {
    return this.usersService.remove(user.id);
  }

  // Everything below is about other people's accounts. Who may do what is
  // decided by the role (here) and by rank (in UsersService): see the
  // permission table in the README.

  @Get()
  @Roles(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN)
  findAll(@Query() query: ListUsersQueryDto, @CurrentUser() actor: AuthUser) {
    return this.usersService.findAll(actor, query);
  }

  @Post()
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    return this.usersService.createByAdmin(dto, actor);
  }

  @Get(':id')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN)
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() actor: AuthUser) {
    return this.usersService.findOneFor(actor, id);
  }

  @Patch(':id')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN)
  updateOther(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProfileDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.usersService.updateOther(actor, id, dto);
  }

  @Patch(':id/role')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN)
  changeRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeRoleDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.usersService.changeRole(actor, id, dto.role);
  }

  @Patch(':id/deactivate')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  deactivate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReasonDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.usersService.setActive(id, actor, false, dto.reason);
  }

  @Patch(':id/activate')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  activate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.usersService.setActive(id, actor, true);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  softDelete(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReasonDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.usersService.softDelete(actor, id, dto.reason);
  }

  @Post(':id/restore')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  restore(@Param('id', ParseIntPipe) id: number, @CurrentUser() actor: AuthUser) {
    return this.usersService.restore(actor, id);
  }

  @Get(':id/posts')
  @Roles(Role.SUPERADMIN)
  postsOf(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ListUsersQueryDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.content.postsOf(actor, id, query.page, query.limit);
  }

  @Get(':id/comments')
  @Roles(Role.SUPERADMIN)
  commentsOf(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ListUsersQueryDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.content.commentsOf(actor, id, query.page, query.limit);
  }
}
