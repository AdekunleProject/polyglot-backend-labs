import { ArrayMaxSize, ArrayMinSize, IsArray, IsNumber } from 'class-validator';

export const SIGNATURE_LENGTH = 48;

export class VisualSearchDto {
  @IsArray()
  @ArrayMinSize(SIGNATURE_LENGTH)
  @ArrayMaxSize(SIGNATURE_LENGTH)
  @IsNumber({}, { each: true })
  signature!: number[];
}
