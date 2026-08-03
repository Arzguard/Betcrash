import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class PlaceBetDto {
  @ApiProperty({ example: 'uuid-of-round' })
  @IsUUID()
  roundId!: string;

  @ApiProperty({ example: 200 })
  @IsNumber()
  @Min(10)
  stake!: number;

  @ApiPropertyOptional({ example: 2.5, description: 'Auto cash-out at this multiplier (optional)' })
  @IsNumber()
  @IsOptional()
  autoCashAt?: number;
}
