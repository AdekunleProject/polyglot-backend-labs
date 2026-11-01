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
import { RedisModule } from './redis/redis.module';
import { HealthController } from './health/health.controller';
import { validateEnv } from './config/env.validation';

const isProduction = process.env.NODE_ENV === 'production';

@Module({
  imports: [
    // Fails at start-up if MONGODB_URI, JWT_SECRET or PAYSTACK_SECRET_KEY is missing.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env', validate: validateEnv }),

    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // No default: a guessable fallback secret lets anyone forge tokens.
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1d' },
      }),
    }),

    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
      }),
    }),

    RedisModule,

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: Number(config.get<string>('REDIS_PORT', '6379')),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
        },
      }),
    }),

    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      // In production the schema is built in memory. Writing src/schema.gql
      // fails in a read-only, non-root container.
      autoSchemaFile: isProduction ? true : join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      playground: !isProduction,
      introspection: !isProduction,
      // req for HTTP, extra for WebSocket subscriptions (see onConnect).
      context: ({ req, extra }: { req?: unknown; extra?: unknown }) => ({ req, extra }),
      subscriptions: {
        'graphql-ws': {
          onConnect: ({ connectionParams, extra }: { connectionParams?: unknown; extra: unknown }) => {
            (extra as Record<string, unknown>).connectionParams = connectionParams;
          },
        },
      },
    }),

    UserModule,
    AuthModule,
    MarketEdgeModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
