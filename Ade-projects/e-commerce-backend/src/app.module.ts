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
import { APP_GUARD } from '@nestjs/core';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { FileUpload } from './aws/aws.file-upload';
import { OrdersModule } from 'src/orders/order.module';
import { PaymentsModule } from 'src/payments/payment.module';
import { AnalyticsModule } from 'src/analytics/analytics.module';
import { NotificationsModule } from 'src/notifications/notification.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 20,
      },
    ]),
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
    ThrottlerGuard,
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
