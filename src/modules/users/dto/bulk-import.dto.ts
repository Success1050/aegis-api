import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Language } from '@prisma/client';

export class BulkImportResidentRow {
  @ApiProperty({ example: 'Sani Bello' })
  @IsNotEmpty({ message: 'Resident name is required' })
  @IsString()
  name: string;

  @ApiProperty({ example: '+2348039876543' })
  @IsNotEmpty({ message: 'Phone number is required' })
  @IsString()
  phone: string;

  @ApiPropertyOptional({ example: 'sani.bello@aegis.ng' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ enum: Language, default: Language.ENGLISH })
  @IsOptional()
  @IsEnum(Language)
  preferredLanguage?: Language;

  @ApiPropertyOptional({ example: 'a0000000-0000-0000-0000-000000000001' })
  @IsOptional()
  @IsString()
  zoneId?: string;

  @ApiPropertyOptional({ example: 'House 12' })
  @IsOptional()
  @IsString()
  houseNumber?: string;

  @ApiPropertyOptional({ example: 'Old Airport Road' })
  @IsOptional()
  @IsString()
  areaDescription?: string;

  @ApiPropertyOptional({ example: 9.897 })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: 8.855 })
  @IsOptional()
  @IsNumber()
  longitude?: number;
}

export class BulkImportDto {
  @ApiProperty({ type: [BulkImportResidentRow], description: 'List of resident records to onboard' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkImportResidentRow)
  residents: BulkImportResidentRow[];
}

export class BulkImportErrorDetail {
  @ApiProperty({ example: 2 })
  row: number;

  @ApiPropertyOptional({ example: '+2348039876543' })
  phone?: string;

  @ApiProperty({ example: 'Phone number already registered' })
  error: string;
}

export class BulkImportResponseDto {
  @ApiProperty({ example: 10 })
  totalProcessed: number;

  @ApiProperty({ example: 9 })
  successCount: number;

  @ApiProperty({ example: 1 })
  failedCount: number;

  @ApiProperty({ type: [BulkImportErrorDetail] })
  errors: BulkImportErrorDetail[];
}
