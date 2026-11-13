import {
  Body,
  ConflictException,
  Controller,
  Headers,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { RequestValidationError } from '../../../shared/http/validation';
import { SessionGuard } from '../../identity';
import { IdempotencyKeyReusedError, RegisterReport } from '../application/register-report';
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
  @UseGuards(SessionGuard)
  async create(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: ReportCreateDto,
    @Res({ passthrough: true }) response: StatusResponse,
  ): Promise<ReportReceiptResponse> {
    if (idempotencyKey === undefined || !isUUID(idempotencyKey)) {
      throw new RequestValidationError('Idempotency-Key: debe ser un UUID');
    }
    try {
      const { receipt, created } = await this.registerReport.execute({
        idempotencyKey,
        report: {
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
      throw error;
    }
  }
}
