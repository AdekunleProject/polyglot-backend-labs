import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { RefundStatus } from '../schemas/refund-request.schema';

export class ListRefundsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(RefundStatus)
  readonly status?: RefundStatus;
}
