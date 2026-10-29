// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { JwtModule } from '@nestjs/jwt';
import { join } from 'path';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { MarketEdgeModule } from './market-edge/market-edge.module';

@Module({
  imports: [
    // 1. Establish central environment variable loader configurations
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

    // 2. Register global JWT token engine capabilities 
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'super-secret-marketedge-key'),
        signOptions: { expiresIn: '1d' },
      }),
    }),

    // 3. Configure fully persistent asynchronous Mongoose connection pool
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
    }),

    // 4. Provision connection settings for your background BullMQ tasks
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: 6379,
          password: config.get<string>('REDIS_PASSWORD'),
        },
      }),
    }),

    // 5. Build our unified single gateway schema file automatically
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      playground: true,
      subscriptions: {
        'graphql-ws': {
          onConnect: (ctx: any) => ({ extra: { connectionParams: ctx.connectionParams } }),
        },
      },
    }),

    UserModule,
    AuthModule,
    MarketEdgeModule,
  ],
})
export class AppModule {}
