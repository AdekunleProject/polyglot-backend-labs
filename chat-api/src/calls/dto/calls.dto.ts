import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class StartCallDto {
  @IsUUID()
  conversationId: string;

  @IsIn(['audio', 'video'])
  type: 'audio' | 'video';
}

export class CallsQueryDto {
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
