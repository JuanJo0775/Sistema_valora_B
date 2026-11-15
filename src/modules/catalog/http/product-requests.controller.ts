import {
  Body,
  ConflictException,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RequestValidationError } from '../../../shared/http/validation';
import {
  type AuthenticatedSession,
  CurrentSession,
  ReporterIdentity,
  Roles,
  SessionGuard,
} from '../../identity';
import {
  DecideProductRequest,
  InvalidRequestNoteError,
  ProductRequestNotFoundError,
} from '../application/decide-product-request';
import { ProductRequestsQueue } from '../application/product-requests-queue';
import { BarcodeTakenError, RequestProduct } from '../application/request-product';
import { ProductRequestDecisionDto, ProductRequestDto } from './product-requests.dto';

// Forma de cada elemento de GET /v1/moderation/product-requests; nunca quién propuso (EC-08).
interface ProductRequestResponse {
  id: string;
  name: string;
  brand?: string;
  categoryCode: string;
  quantity: number;
  unit: string;
  packCount: number;
  barcode?: string;
  possibleDuplicates: { id: string; name: string }[];
  createdAt: string;
}

// RF-003 RN2: el 409 dice cuál producto ya tiene el código.
function barcodeTaken(error: BarcodeTakenError): ConflictException {
  return new ConflictException({ code: 'BARCODE_TAKEN', message: error.message });
}

// RF-003 RN3 (grill de la #26): un reportante propone un producto y un moderador lo decide.
@Controller()
export class ProductRequestsController {
  constructor(
    private readonly requestProduct: RequestProduct,
    private readonly queue: ProductRequestsQueue,
    private readonly decideRequest: DecideProductRequest,
    private readonly identities: ReporterIdentity,
  ) {}

  @Post('product-requests')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(SessionGuard)
  @Roles('reportante')
  async request(
    @Body() body: ProductRequestDto,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<{ id: string; status: 'pendiente' }> {
    // EC-08: catalog solo guarda la clave seudónima de quien propone.
    const { reporterKey } = await this.identities.of(session.accountId);
    try {
      return await this.requestProduct.execute({
        name: body.name,
        ...(body.brand === undefined ? {} : { brand: body.brand }),
        categoryCode: body.categoryCode,
        quantity: body.quantity,
        unit: body.unit,
        packCount: body.packCount ?? 1,
        ...(body.barcode === undefined ? {} : { barcode: body.barcode }),
        requesterKey: reporterKey,
      });
    } catch (error) {
      if (error instanceof BarcodeTakenError) throw barcodeTaken(error);
      throw error;
    }
  }

  @Get('moderation/product-requests')
  @Header('Cache-Control', 'no-store')
  @UseGuards(SessionGuard)
  @Roles('moderador')
  async list(): Promise<{ items: ProductRequestResponse[] }> {
    const items = await this.queue.list();
    return { items: items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })) };
  }

  @Post('moderation/product-requests/:requestId/decision')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  @Roles('moderador')
  async decide(
    @Param(
      'requestId',
      new ParseUUIDPipe({
        exceptionFactory: () => new RequestValidationError('requestId: debe ser un UUID'),
      }),
    )
    requestId: string,
    @Body() body: ProductRequestDecisionDto,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<void> {
    const { reporterKey } = await this.identities.of(session.accountId);
    try {
      await this.decideRequest.execute({
        requestId,
        decision: body.decision,
        ...(body.mergeInto === undefined ? {} : { mergeInto: body.mergeInto }),
        note: body.note,
        moderatorKey: reporterKey,
      });
    } catch (error) {
      if (error instanceof ProductRequestNotFoundError) throw new NotFoundException();
      if (error instanceof BarcodeTakenError) throw barcodeTaken(error);
      // El DTO mide el texto tal cual; el caso de uso, sin los espacios de los extremos.
      if (error instanceof InvalidRequestNoteError) {
        throw new RequestValidationError(`note: ${error.message}`);
      }
      throw error;
    }
  }
}
