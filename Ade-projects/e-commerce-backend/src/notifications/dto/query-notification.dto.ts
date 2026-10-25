import { IsOptional, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class QueryNotificationDto {
  // Same pattern as QueryProductDto.featured — query params arrive as
  // strings, so the raw 'true'/'false' text needs an explicit transform.
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  unreadOnly?: boolean;
}
