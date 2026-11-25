import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AppLockController } from './app-lock.controller';
import { AppLockService } from './app-lock.service';

@Module({
  imports: [AuditModule],
  controllers: [AppLockController],
  providers: [AppLockService],
})
export class AppLockModule {}
