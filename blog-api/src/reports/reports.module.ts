import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { Comment } from '../comments/entities/comment.entity';
import { MailModule } from '../mail/mail.module';
import { Post } from '../posts/entities/post.entity';
import { User } from '../users/entities/user.entity';
import { DigestService } from './digest.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Post, Comment]), AuditModule, MailModule],
  controllers: [ReportsController],
  providers: [ReportsService, DigestService],
})
export class ReportsModule {}
