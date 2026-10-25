import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsMongoId, Min } from 'class-validator';

export class AddCartItemDto {
  @ApiProperty()
  @IsMongoId()
  variantId!: string;

  @ApiProperty({
    example: 2,
  })
  @IsInt()
  @Min(1)
  quantity!: number;
}
