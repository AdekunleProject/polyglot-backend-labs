import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from '../auth/entities/session.entity';
import { AwsModule } from '../aws/aws.module';
import { MailModule } from '../mail/mail.module';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Session]), AwsModule, MailModule],
  controllers: [UsersController],
  providers: [UsersService, AdminBootstrapService],
  exports: [UsersService],
})
export class UsersModule {}
