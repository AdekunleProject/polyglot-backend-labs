import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ChatModule } from '../chat/chat.module';
import { DevicesModule } from '../devices/devices.module';
import { UsersModule } from '../users/users.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [ChatModule, UsersModule, AuditModule, DevicesModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ModerationModule {}
