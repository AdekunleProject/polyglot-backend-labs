import { Module } from '@nestjs/common';
import { AwsModule } from '../aws/aws.module';
import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';

@Module({
  imports: [AwsModule],
  controllers: [BackupsController],
  providers: [BackupsService],
})
export class BackupsModule {}
