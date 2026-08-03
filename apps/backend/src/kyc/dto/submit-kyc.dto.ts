import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class SubmitKycDto {
  @ApiProperty({ example: '34567891' })
  @IsString()
  @MinLength(6)
  idNumber!: string;

  @ApiProperty({ example: '1998-03-14' })
  @IsDateString()
  dateOfBirth!: string;

  @ApiPropertyOptional({ example: 'https://storage/docs/id_front.jpg' })
  @IsString()
  @IsOptional()
  idDocumentUrl?: string;

  @ApiPropertyOptional({ example: 'https://storage/docs/selfie.jpg' })
  @IsString()
  @IsOptional()
  selfieUrl?: string;
}
