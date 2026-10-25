import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateBrandDto {
  @ApiProperty({
    example: 'Apple',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;
}
