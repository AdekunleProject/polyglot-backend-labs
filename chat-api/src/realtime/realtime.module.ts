import { Global, Module } from '@nestjs/common';
import { RealtimeService } from './realtime.service';

/** Global so any module (auth, chat, calls) can push live events. */
@Global()
@Module({ providers: [RealtimeService], exports: [RealtimeService] })
export class RealtimeModule {}
