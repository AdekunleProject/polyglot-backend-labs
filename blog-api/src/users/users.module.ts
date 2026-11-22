import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { Session } from '../auth/entities/session.entity';
import { AwsModule } from '../aws/aws.module';
import { Comment } from '../comments/entities/comment.entity';
import { MailModule } from '../mail/mail.module';
import { Post } from '../posts/entities/post.entity';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { User } from './entities/user.entity';
import { UserContentService } from './user-content.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Session, Post, Comment]),
    AwsModule,
    MailModule,
    AuditModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, UserContentService, AdminBootstrapService],
  exports: [UsersService],
})
export class UsersModule {}
