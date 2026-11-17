import {
  Body,
  ConflictException,
  Controller,
  Headers,
  HttpException,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { RequestValidationError } from '../../../shared/http/validation';
import {
  type AuthenticatedSession,
  CurrentSession,
  Roles,
  SessionGuard,
  VerifiedEmailGuard,
} from '../../identity';
import {
  DuplicateReportError,
  IdempotencyKeyReusedError,
  RegisterReport,
  TooManyReportsError,
} from '../application/register-report';
import { ReportCreateDto } from './report-create.dto';

// Lo único que se usa de la respuesta de Express: fijar el estado HTTP.
interface StatusResponse {
  status(code: number): unknown;
}

// Esquema ReportReceipt del contrato.
interface ReportReceiptResponse {
  id: string;
  status: 'recibido';
  receivedAt: string;
}

@Controller('reports')
export class ReportsController {
  constructor(private readonly registerReport: RegisterReport) {}

  // EC-07: 201 la primera vez; 200 con el recibo original si es un reintento con la misma clave.
  @Post()
  @UseGuards(SessionGuard, VerifiedEmailGuard)
  // Grill de la #16, pregunta 5: solo el reportante aporta precios de la comunidad (EC-06).
  @Roles('reportante')
  // ADR-029: y con el correo verificado (403 EMAIL_NOT_VERIFIED).
  async create(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: ReportCreateDto,
    @Res({ passthrough: true }) response: StatusResponse,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<ReportReceiptResponse> {
    if (idempotencyKey === undefined || !isUUID(idempotencyKey)) {
      throw new RequestValidationError('Idempotency-Key: debe ser un UUID');
    }
    try {
      const { receipt, created } = await this.registerReport.execute({
        idempotencyKey,
        report: {
          reporterId: session.accountId,
          presentationId: body.presentationId,
          establishmentId: body.establishmentId,
          priceCop: body.priceCop,
          priceType: body.priceType,
          observedAt: new Date(body.observedAt),
        },
      });
      response.status(created ? HttpStatus.CREATED : HttpStatus.OK);
      return { ...receipt, receivedAt: receipt.receivedAt.toISOString() };
    } catch (error) {
      if (error instanceof IdempotencyKeyReusedError) {
        throw new ConflictException({ code: error.code, message: error.message });
      }
      // Issue #84: desde qué hora de observación se acepta otro reporte.
      if (error instanceof DuplicateReportError) {
        throw new ConflictException({
          code: error.code,
          message: error.message,
          availableFrom: error.availableFrom.toISOString(),
        });
      }
      // RF-012 RN2: el filtro de errores pone la cabecera Retry-After con estos segundos.
      if (error instanceof TooManyReportsError) {
        throw new HttpException(
          { retryAfterSeconds: error.retryAfterSeconds },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw error;
    }
  }
}
