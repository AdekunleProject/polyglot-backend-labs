import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const REPORT_CATEGORIES = ['spam', 'abuse', 'harassment', 'scam', 'illegal', 'other'] as const;

export class CreateReportDto {
  @IsIn(['user', 'message', 'status'])
  targetType: 'user' | 'message' | 'status';

  @IsInt()
  @Min(1)
  targetId: number;

  @IsIn(REPORT_CATEGORIES)
  category: (typeof REPORT_CATEGORIES)[number];

  // In the reporter's own words. Required: a report without a reason cannot be judged.
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason: string;
}

export class VerifyReportDto {
  // Does the evidence support the report?
  @IsBoolean()
  valid: boolean;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  note: string;
}

export class DecideReportDto {
  @IsIn(['dismiss', 'remove_content', 'suspend_user', 'remove_and_suspend'])
  decision: 'dismiss' | 'remove_content' | 'suspend_user' | 'remove_and_suspend';

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}

export class ListReportsQueryDto {
  @IsOptional()
  @IsIn(['open', 'reviewed', 'dismissed', 'actioned'])
  status?: 'open' | 'reviewed' | 'dismissed' | 'actioned';

  @IsOptional()
  @IsIn(['user', 'message', 'status'])
  targetType?: 'user' | 'message' | 'status';

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
