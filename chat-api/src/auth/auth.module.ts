import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AwsModule } from '../aws/aws.module';
import { MailModule } from '../mail/mail.module';
import { User } from '../users/entities/user.entity';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailToken } from './entities/mail-token.entity';
import { RecoveryCode } from './entities/recovery-code.entity';
import { Session } from './entities/session.entity';
import { GoogleAuthGuard } from './google-auth.guard';
import { GoogleStrategy } from './google.strategy';
import { JwtStrategy } from './jwt.strategy';
import { TwoFactorController } from './two-factor/two-factor.controller';
import { TwoFactorService } from './two-factor/two-factor.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Session, MailToken, RecoveryCode]),
    PassportModule,
    UsersModule,
    MailModule,
    AwsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') ??
            '15m') as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController, TwoFactorController],
  providers: [
    AuthService,
    TwoFactorService,
    JwtStrategy,
    GoogleAuthGuard,
    // Google sign-in is optional: the strategy exists only when its settings do.
    {
      provide: GoogleStrategy,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get('GOOGLE_CLIENT_ID') ? new GoogleStrategy(config) : null,
    },
  ],
  exports: [AuthService, TypeOrmModule],
})
export class AuthModule {}
