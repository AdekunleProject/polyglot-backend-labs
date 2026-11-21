import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { UserSchema, User } from 'src/users/schemas/user.schema';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from 'src/common/strategies/jwt.strategy';
// import {StringValue} from 'ms'
import { UsersModule } from '../users/user.module';
import { MailToken, MailTokenSchema } from 'src/users/schemas/mail.schema';
import { MailModule } from 'src/helpers/mail/mail.module';
import { TwoFactorController } from './two-factor/two-factor.controller';
import { TwoFactorService } from './two-factor/two-factor.service';
import { GoogleStrategy } from '../common/strategies/google.strategy';
import { FileUpload } from 'src/aws/aws.file-upload';
import { NotificationsModule } from 'src/notifications/notification.module';

@Module({
  imports: [
    PassportModule,
    ConfigModule,
    UsersModule,
    NotificationsModule,
    MailModule,

    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),

        // signOptions: {
        expiresIn: config.get<string>('JWT_EXPIRES_IN'),
        // },
      }),
    }),
    // JwtModule.register({
    //   secret: 'mysecretkey',
    //   signOptions: { expiresIn: '1d' },
    // }),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: MailToken.name, schema: MailTokenSchema },
    ]),
  ],
  controllers: [AuthController, TwoFactorController],

  providers: [
    AuthService,
    TwoFactorService,
    JwtStrategy,
    GoogleStrategy,
    FileUpload,
  ],

  exports: [AuthService],
})
export class AuthModule {}
