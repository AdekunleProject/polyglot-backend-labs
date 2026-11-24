import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateDirectDto {
  @IsInt()
  userId: number;
}

export class CreateGroupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(255)
  @IsInt({ each: true })
  memberIds: number[];
}

export class UpdateGroupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title: string;
}

export class AddMembersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  userIds: number[];
}

export class SetRoleDto {
  @IsIn(['admin', 'member'])
  role: 'admin' | 'member';
}

export class SendMessageDto {
  @IsUUID()
  conversationId: string;

  // A random id made by the phone for each message it sends, so a retry is safe.
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  clientId: string;

  @IsOptional()
  @IsIn(['text', 'image', 'file', 'voice', 'video'])
  type?: 'text' | 'image' | 'file' | 'voice' | 'video';

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  @IsOptional()
  @IsInt()
  replyToId?: number;
}

export class SendMessageBodyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  clientId: string;

  @IsOptional()
  @IsIn(['text'])
  type?: 'text';

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body: string;

  @IsOptional()
  @IsInt()
  replyToId?: number;
}

export class EditMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body: string;
}

export class ReadDto {
  @IsInt()
  @Min(1)
  upToId: number;
}

export class TypingDto {
  @IsUUID()
  conversationId: string;

  @IsOptional()
  isTyping?: boolean;
}

export class ReceiptDto {
  @IsUUID()
  conversationId: string;

  @IsInt()
  @Min(1)
  upToId: number;
}

export class MessagesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 30;
}

export class PeopleQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  q: string;
}
