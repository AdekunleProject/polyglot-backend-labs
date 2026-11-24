import { Body, Controller, Delete, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.type';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto, RemoveDeviceDto } from './dto/devices.dto';

@Controller('devices')
@UseGuards(JwtAuthGuard)
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post()
  @HttpCode(200)
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterDeviceDto) {
    return this.devices.register(user.id, dto.token, dto.platform);
  }

  @Delete()
  remove(@CurrentUser() user: AuthUser, @Body() dto: RemoveDeviceDto) {
    return this.devices.remove(user.id, dto.token);
  }
}
