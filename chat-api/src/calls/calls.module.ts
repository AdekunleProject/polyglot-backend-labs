import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatModule } from '../chat/chat.module';
import { DevicesModule } from '../devices/devices.module';
import { CALL_MEDIA, FakeMedia, LiveKitMedia } from './call-media';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';

@Module({
  imports: [ChatModule, DevicesModule],
  controllers: [CallsController],
  providers: [
    CallsService,
    {
      provide: CALL_MEDIA,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get('CALLS_PROVIDER') === 'livekit'
          ? new LiveKitMedia(
              config.getOrThrow<string>('LIVEKIT_URL'),
              config.getOrThrow<string>('LIVEKIT_API_KEY'),
              config.getOrThrow<string>('LIVEKIT_API_SECRET'),
            )
          : new FakeMedia(config.get('NODE_ENV') === 'production'),
    },
  ],
})
export class CallsModule {}
