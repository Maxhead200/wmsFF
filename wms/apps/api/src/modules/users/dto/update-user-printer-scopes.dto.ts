import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';

export class UserPrinterScopeDto {
  @IsString()
  groupCode!: string;

  @IsOptional()
  @IsBoolean()
  canPrint?: boolean;

  @IsOptional()
  @IsBoolean()
  canManage?: boolean;
}

export class UpdateUserPrinterScopesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserPrinterScopeDto)
  scopes!: UserPrinterScopeDto[];
}
