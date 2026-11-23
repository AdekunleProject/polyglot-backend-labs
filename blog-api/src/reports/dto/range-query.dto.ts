import { IsDateString, IsIn, IsOptional } from 'class-validator';

export class RangeQueryDto {
  /** Start of the period (ISO date). Default: 30 days before `to`. */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** End of the period (ISO date). Default: now. */
  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: 'json' | 'csv';
}
