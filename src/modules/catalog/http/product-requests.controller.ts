import {
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  type AuthenticatedSession,
  CurrentSession,
  ReporterIdentity,
  Roles,
  SessionGuard,
} from '../../identity';
import { BarcodeTakenError, RequestProduct } from '../application/request-product';
import { ProductRequestDto } from './product-requests.dto';

// RF-003 RN2: el 409 dice cuál producto ya tiene el código.
export function barcodeTaken(error: BarcodeTakenError): ConflictException {
  return new ConflictException({ code: 'BARCODE_TAKEN', message: error.message });
}

// RF-003 RN3 (grill de la #26): un reportante propone un producto y un moderador lo decide.
@Controller()
export class ProductRequestsController {
  constructor(
    private readonly requestProduct: RequestProduct,
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
}
