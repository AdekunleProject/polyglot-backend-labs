import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ChatModule } from '../chat/chat.module';
import { StatusModule } from '../status/status.module';
import { MaintenanceService } from './maintenance.service';

@Module({
  imports: [ChatModule, StatusModule, AnalyticsModule],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
