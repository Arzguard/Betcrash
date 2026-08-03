import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ReviewKycDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  approved!: boolean;

  @ApiPropertyOptional({ example: 'Document appears altered' })
  @IsString()
  @IsOptional()
  rejectReason?: string;

  @ApiPropertyOptional({ example: 97, description: 'Face match score 0-100' })
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  idMatchScore?: number;
}
