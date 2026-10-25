import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { UsersController } from './user.controller';
import { UsersService } from './user.service';
import { FileUpload } from 'src/aws/aws.file-upload';
import { NotificationsModule } from 'src/notifications/notification.module';

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
  providers: [UsersService, FileUpload],
  exports: [UsersService, MongooseModule],
})
export class UsersModule {}
