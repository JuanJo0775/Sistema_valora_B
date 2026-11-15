import {
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RequestValidationError } from '../../../shared/http/validation';
import {
  AccountNotFoundError,
  ChangeRole,
  InvalidRoleNoteError,
  OwnRoleError,
  RoleUnchangedError,
  TooManyAttemptsError,
} from '../application/change-role';
import { ChangeRoleDto } from './auth.dto';
import { type AuthenticatedSession, CurrentSession, Roles, SessionGuard } from './session.guard';

// RF-002 RN1 y RN4 (grill de la #73): un moderador cambia el rol de otra cuenta.
@Controller('moderation/roles')
export class RolesController {
  constructor(private readonly changeRole: ChangeRole) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  @Roles('moderador')
  async change(
    @Body() body: ChangeRoleDto,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<void> {
    try {
      await this.changeRole.execute({
        email: body.email,
        role: body.role,
        note: body.note,
        changedBy: session.accountId,
      });
    } catch (error) {
      if (error instanceof TooManyAttemptsError) {
        throw new HttpException(
          { retryAfterSeconds: error.retryAfterSeconds },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (error instanceof AccountNotFoundError) throw new NotFoundException();
      if (error instanceof OwnRoleError || error instanceof RoleUnchangedError) {
        throw new ConflictException({ code: error.code, message: error.message });
      }
      // El DTO mide el texto tal cual; el caso de uso, sin los espacios de los extremos.
      if (error instanceof InvalidRoleNoteError) {
        throw new RequestValidationError(`note: ${error.message}`);
      }
      throw error;
    }
  }
}
