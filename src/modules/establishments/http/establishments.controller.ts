import { Controller, Get, Header, Query } from '@nestjs/common';
import { RequestValidationError } from '../../../shared/http/validation';
import { ListNearbyEstablishments } from '../application/list-nearby-establishments';
import { SearchEstablishments } from '../application/search-establishments';
import {
  type EstablishmentDetailResponse,
  toEstablishmentDetailResponse,
} from './establishment.response';
import { NearbyQueryDto } from './nearby.query';
import { SearchEstablishmentsQueryDto } from './search-establishments.query';
import { type NearbyResponse, toNearbyResponse } from './nearby.response';

@Controller('establishments')
export class EstablishmentsController {
  constructor(
    private readonly listNearby: ListNearbyEstablishments,
    private readonly searchEstablishments: SearchEstablishments,
  ) {}

  // #116: el directorio cambia poco; caché pública de 5 minutos (valor inicial calibrable, EC-04).
  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  async search(
    @Query() query: SearchEstablishmentsQueryDto,
  ): Promise<{ items: EstablishmentDetailResponse[] }> {
    const { q, municipality, limit } = query;
    // #116: sin ningún filtro devolvería todo el directorio.
    if (q === undefined && municipality === undefined) {
      throw new RequestValidationError('Envía q o municipality');
    }
    const found = await this.searchEstablishments.execute({ q, municipality, limit });
    return { items: found.map(toEstablishmentDetailResponse) };
  }

  // no-store: la URL lleva la ubicación del usuario y no debe quedar en ninguna caché (EC-08).
  @Get('nearby')
  @Header('Cache-Control', 'no-store')
  async nearby(@Query() query: NearbyQueryDto): Promise<NearbyResponse> {
    return toNearbyResponse(await this.listNearby.execute(query));
  }
}
