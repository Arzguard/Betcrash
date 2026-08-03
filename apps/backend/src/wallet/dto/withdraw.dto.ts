import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, Min } from 'class-validator';

export class WithdrawDto {
  @ApiProperty({ example: 1000 })
  @IsNumber()
  @Min(100)
  amount!: number;

  @ApiProperty({ example: '0712345678' })
  @IsString()
  mpesaPhone!: string;
}
