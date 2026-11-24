import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { SecurityModule } from '../security/security.module';
import { User } from '../users/entities/user.entity';
import { LinksController } from './links.controller';
import { LinksService } from './links.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuthModule, SecurityModule, AuditModule],
  controllers: [LinksController],
  providers: [LinksService],
})
export class LinksModule {}
