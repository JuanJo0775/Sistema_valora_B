import { Controller, Get, Header, Query } from '@nestjs/common';
import { RequestValidationError } from '../../../shared/http/validation';
import { ListNearbyEstablishments, SearchEstablishments } from '../../establishments';
import { PriceCounts } from '../application/price-counts';
import {
  type EstablishmentDetailResponse,
  toEstablishmentDetailResponse,
} from './establishment.response';
import { NearbyQueryDto } from './nearby.query';
import { type NearbyResponse, toNearbyResponse } from './nearby.response';
import { SearchEstablishmentsQueryDto } from './search-establishments.query';

// B#131: las listas de tiendas cuelgan de /establishments, como sus precios (grill de la #28),
// pero las sirve comparison: las tiendas vienen de la interfaz pública de establishments y el
// conteo de precios vigentes, de price_current. Así establishments no depende de comparison.
@Controller('establishments')
export class EstablishmentListsController {
  constructor(
    private readonly listNearby: ListNearbyEstablishments,
    private readonly searchEstablishments: SearchEstablishments,
    private readonly priceCounts: PriceCounts,
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
    const counts = await this.priceCounts.of(found.map(({ id }) => id));
    return {
      items: found.map((store) => toEstablishmentDetailResponse(store, counts.get(store.id) ?? 0)),
    };
  }

  // no-store: la URL lleva la ubicación del usuario y no debe quedar en ninguna caché (EC-08).
  @Get('nearby')
  @Header('Cache-Control', 'no-store')
  async nearby(@Query() query: NearbyQueryDto): Promise<NearbyResponse> {
    const found = await this.listNearby.execute(query);
    return toNearbyResponse(found, await this.priceCounts.of(found.map(({ id }) => id)));
  }
}
