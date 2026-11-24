import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { DevicesModule } from '../devices/devices.module';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ConversationsService } from './conversations.service';
import { MessagesService } from './messages.service';
import { RealtimeService } from './realtime.service';
import { Conversation } from './entities/conversation.entity';
import { ConversationMember } from './entities/conversation-member.entity';
import { Message } from './entities/message.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, ConversationMember, Message]),
    DevicesModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ secret: config.getOrThrow<string>('JWT_SECRET') }),
    }),
  ],
  controllers: [ChatController],
  providers: [ChatGateway, ConversationsService, MessagesService, RealtimeService],
  exports: [RealtimeService, ConversationsService],
})
export class ChatModule {}
