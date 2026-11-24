import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
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

  // For image, file, voice and video: the id returned by POST /media/uploads.
  @IsOptional()
  @IsUUID()
  mediaId?: string;

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
  @IsIn(['text', 'image', 'file', 'voice', 'video'])
  type?: 'text' | 'image' | 'file' | 'voice' | 'video';

  // The text, or the caption of a photo or video.
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  @IsOptional()
  @IsUUID()
  mediaId?: string;

  @IsOptional()
  @IsInt()
  replyToId?: number;
}

export class CreateUploadDto {
  // The chat the file is for. Leave out for a status post and set forStatus.
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsOptional()
  @IsBoolean()
  forStatus?: boolean;

  @IsIn(['image', 'file', 'voice', 'video'])
  kind: 'image' | 'file' | 'voice' | 'video';

  @IsString()
  @MaxLength(100)
  contentType: string;

  @IsInt()
  @Min(1)
  size: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  filename?: string;

  // Voice notes and videos: how long it plays.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4 * 60 * 60 * 1000)
  durationMs?: number;

  // Voice notes: up to 100 bars (0-255) for drawing the waveform.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(255, { each: true })
  waveform?: number[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20000)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20000)
  height?: number;
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
