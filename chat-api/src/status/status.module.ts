import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { StatusController } from './status.controller';
import { StatusService } from './status.service';

@Module({
  imports: [ChatModule],
  controllers: [StatusController],
  providers: [StatusService],
  exports: [StatusService],
})
export class StatusModule {}
