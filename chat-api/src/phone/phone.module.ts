import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { SecurityModule } from '../security/security.module';
import { User } from '../users/entities/user.entity';
import { PhoneController } from './phone.controller';
import { PhoneService } from './phone.service';
import { SmsService } from './sms.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuthModule, SecurityModule, AuditModule],
  controllers: [PhoneController],
  providers: [PhoneService, SmsService],
  exports: [SmsService],
})
export class PhoneModule {}
