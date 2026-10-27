import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { UsersController } from './user.controller';
import { UsersService } from './user.service';
import { FileUpload } from 'src/aws/aws.file-upload';
import { NotificationsModule } from 'src/notifications/notification.module';
import { AdminBootstrapService } from './admin-bootstrap.service';

@Module({
  imports: [
    NotificationsModule,
    MongooseModule.forFeature([
      {
        name: User.name,
        schema: UserSchema,
      },
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService, FileUpload, AdminBootstrapService],
  exports: [UsersService, MongooseModule],
})
export class UsersModule {}
