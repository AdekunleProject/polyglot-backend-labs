import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module';
import { MailModule } from '../mail/mail.module';
import { SecurityNoticeService } from './security-notice.service';

@Module({
  imports: [DevicesModule, MailModule],
  providers: [SecurityNoticeService],
  exports: [SecurityNoticeService],
})
export class SecurityModule {}
