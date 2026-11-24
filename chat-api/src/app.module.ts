import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Redis } from 'ioredis';
import { RedisThrottlerStorage } from './common/redis-throttler.storage';
import { EmailThrottlerGuard } from './auth/email-throttler.guard';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChatModule } from './chat/chat.module';
import { CallsModule } from './calls/calls.module';
import { BackupsModule } from './backups/backups.module';
import { ContactsModule } from './contacts/contacts.module';
import { LinksModule } from './links/links.module';
import { WalletModule } from './wallet/wallet.module';
import { StatusModule } from './status/status.module';
import { PhoneModule } from './phone/phone.module';
import { RealtimeModule } from './realtime/realtime.module';
import { DevicesModule } from './devices/devices.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Every route: THROTTLE_LIMIT requests per minute per client address.
    // The auth routes set tighter limits of their own. Counters live in Redis
    // when REDIS_URL is set (shared by every replica), else in memory.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const throttlers = [
          { ttl: 60_000, limit: Number(config.get('THROTTLE_LIMIT') ?? 60) },
        ];
        const redisUrl = config.get<string>('REDIS_URL');
        if (!redisUrl) return { throttlers };
        const redis = new Redis(redisUrl, {
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          connectTimeout: 2000,
        });
        // Without a listener an error event would crash the process.
        redis.on('error', () => undefined);
        return { throttlers, storage: new RedisThrottlerStorage(redis) };
      },
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.getOrThrow<string>('DB_HOST'),
        port: Number(config.getOrThrow('DB_PORT')),
        username: config.getOrThrow<string>('DB_USER'),
        password: config.getOrThrow<string>('DB_PASSWORD'),
        database: config.getOrThrow<string>('DB_NAME'),
        // Managed databases (Neon, Render, RDS...) usually require TLS.
        ssl: config.get('DB_SSL') === 'true',
        autoLoadEntities: true,
        synchronize: false, // migrations only, from the start
        // Works from src (ts) and from dist (js). Set RUN_MIGRATIONS=true to
        // apply pending migrations when the app starts.
        migrations: [join(__dirname, 'migrations', '*{.ts,.js}')],
        migrationsRun: config.get('RUN_MIGRATIONS') === 'true',
      }),
    }),
    AuthModule,
    UsersModule,
    RealtimeModule,
    DevicesModule,
    ChatModule,
    ContactsModule,
    LinksModule,
    PhoneModule,
    BackupsModule,
    StatusModule,
    WalletModule,
    CallsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Limit per client address on every route, then per email address on the
    // routes marked with @ThrottleByEmail().
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: EmailThrottlerGuard },
  ],
})
export class AppModule {}
