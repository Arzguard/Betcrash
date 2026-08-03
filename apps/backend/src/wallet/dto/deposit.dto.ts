import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, Min } from 'class-validator';

export class DepositDto {
  @ApiProperty({ example: 500 })
  @IsNumber()
  @Min(10)
  amount!: number;

  @ApiProperty({ example: '0712345678' })
  @IsString()
  mpesaPhone!: string;
}
