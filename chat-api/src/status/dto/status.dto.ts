import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateStatusDto {
  @IsIn(['text', 'image', 'video'])
  type: 'text' | 'image' | 'video';

  // The text of a text status, or the caption of a photo or video.
  @IsOptional()
  @IsString()
  @MaxLength(700)
  body?: string;

  // From POST /media/uploads with forStatus: true.
  @IsOptional()
  @IsUUID()
  mediaId?: string;

  // Background of a text status, like #1F8A70.
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  bgColor?: string;

  // contacts: everyone you chat with. only: just audienceIds. except: contacts but not audienceIds.
  @IsOptional()
  @IsIn(['contacts', 'only', 'except'])
  privacy?: 'contacts' | 'only' | 'except';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(256)
  @IsInt({ each: true })
  audienceIds?: number[];
}

export class StatusReplyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  clientId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(3000)
  body: string;
}

export class StatusIdDto {
  @Type(() => Number)
  @IsInt()
  id: number;
}
