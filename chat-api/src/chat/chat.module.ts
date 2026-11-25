import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AwsModule } from '../aws/aws.module';
import { DevicesModule } from '../devices/devices.module';
import { BlocksController } from './blocks.controller';
import { BlocksService } from './blocks.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ConversationsService } from './conversations.service';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { MessagesService } from './messages.service';
import { Conversation } from './entities/conversation.entity';
import { ConversationMember } from './entities/conversation-member.entity';
import { Message } from './entities/message.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, ConversationMember, Message]),
    DevicesModule,
    AwsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ secret: config.getOrThrow<string>('JWT_SECRET') }),
    }),
  ],
  controllers: [ChatController, MediaController, BlocksController],
  providers: [ChatGateway, ConversationsService, MessagesService, MediaService, BlocksService],
  exports: [ConversationsService, MessagesService, MediaService, BlocksService],
})
export class ChatModule {}
