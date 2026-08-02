import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsPhoneNumber, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Grace Wanjiku' })
  @IsNotEmpty()
  @IsString()
  name!: string;

  @ApiProperty({ example: 'grace.w@example.com' })
  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '0712345678' })
  @IsNotEmpty()
  @IsPhoneNumber('KE')
  phone!: string;

  @ApiProperty({ example: 'strongpassword123' })
  @IsNotEmpty()
  @MinLength(8)
  password!: string;
}
