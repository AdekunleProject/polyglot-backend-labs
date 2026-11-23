import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from 'src/common/decorators/current-user.decorators';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enums/role.enum';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import type { CurrentUserInterface } from 'src/common/interfaces/current-user.interface';
import { CreateRefundRequestDto } from './dto/create-refund-request.dto';
import { ListRefundsQueryDto } from './dto/list-refunds-query.dto';
import { ReviewDto } from './dto/review.dto';
import { evidenceUploadOptions } from './evidence-upload';
import { RefundsService } from './refunds.service';

@Controller('refunds')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Post()
  @Roles(Role.CUSTOMER)
  @UseInterceptors(FilesInterceptor('evidence', 5, evidenceUploadOptions))
  create(
    @CurrentUser() user: CurrentUserInterface,
    @Body() dto: CreateRefundRequestDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.refunds.create(user.id, dto, files ?? []);
  }

  @Get('mine')
  @Roles(Role.CUSTOMER)
  mine(@CurrentUser() user: CurrentUserInterface) {
    return this.refunds.mine(user.id);
  }

  @Get()
  @Roles(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN)
  list(@Query() query: ListRefundsQueryDto) {
    return this.refunds.list(query);
  }

  @Get(':id')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN)
  get(@Param('id') id: string) {
    return this.refunds.get(id);
  }

  @Patch(':id/verify')
  @Roles(Role.MANAGER)
  verify(
    @CurrentUser() user: CurrentUserInterface,
    @Param('id') id: string,
    @Body() dto: ReviewDto,
  ) {
    return this.refunds.verify(user, id, dto);
  }

  @Patch(':id/decide')
  @Roles(Role.ADMIN)
  decide(
    @CurrentUser() user: CurrentUserInterface,
    @Param('id') id: string,
    @Body() dto: ReviewDto,
  ) {
    return this.refunds.decide(user, id, dto);
  }

  @Patch(':id/replacement-sent')
  @Roles(Role.MANAGER)
  replacementSent(
    @CurrentUser() user: CurrentUserInterface,
    @Param('id') id: string,
  ) {
    return this.refunds.markReplacementSent(user, id);
  }
}
