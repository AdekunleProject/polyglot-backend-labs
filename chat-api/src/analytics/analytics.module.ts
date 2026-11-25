import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { User } from '../users/entities/user.entity';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { DigestService } from './digest.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuditModule, MailModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, DigestService],
})
export class AnalyticsModule {}
