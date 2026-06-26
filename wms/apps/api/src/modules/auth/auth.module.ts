import { Module } from '@nestjs/common';
import { AccessModelService } from './access-model.service';
import { AccessTokenService } from './access-token.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './guards/auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { PasswordService } from './password.service';

@Module({
  controllers: [AuthController],
  providers: [AccessModelService, AccessTokenService, AuthGuard, AuthService, PasswordService, PermissionsGuard],
  exports: [AccessModelService, AccessTokenService, AuthGuard, PasswordService, PermissionsGuard],
})
export class AuthModule {}
