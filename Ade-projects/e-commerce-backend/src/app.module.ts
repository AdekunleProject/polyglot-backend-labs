import { Module } from '@nestjs/common';
import { AppController } from 'src/app.controller';
import { AppService } from 'src/app.service';
import { UsersModule } from 'src/users/user.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from 'src/categories/category.module';
import { BrandsModule } from 'src/brands/brand.module';
import { ProductsModule } from 'src/products/product.module';
import { VariantsModule } from 'src/Product-Variants/product-variant.module';
import { CartModule } from 'src/cart/cart.module';
import { FileUpload } from './aws/aws.file-upload';
import { OrdersModule } from 'src/orders/order.module';
import { PaymentsModule } from 'src/payments/payment.module';
import { AnalyticsModule } from 'src/analytics/analytics.module';
import { NotificationsModule } from 'src/notifications/notification.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { Redis } from 'ioredis';
import { RedisThrottlerStorage } from './common/redis-throttler.storage';
import { EmailThrottlerGuard } from './auth/email-throttler.guard';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
    // Every route: THROTTLE_LIMIT requests per minute per client address. The
    // auth routes set tighter limits of their own. Counters live in Redis when
    // REDIS_URL is set (shared by every replica), else in memory.
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
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
    }),
    UsersModule,
    AuthModule,
    CategoriesModule,
    BrandsModule,
    ProductsModule,
    VariantsModule,
    CartModule,
    OrdersModule,
    PaymentsModule,
    AnalyticsModule,
    NotificationsModule,
  ],

  controllers: [AppController],
  providers: [
    AppService,
    FileUpload,
    // Registered here (not in main.ts) so the tests run with the same guards.
    // The second one counts per email, on the routes marked @ThrottleByEmail().
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: EmailThrottlerGuard },
  ],
})
export class AppModule {}
