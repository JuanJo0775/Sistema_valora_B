import { Controller, Get, Header, Query } from '@nestjs/common';
import { ListNearbyEstablishments } from '../application/list-nearby-establishments';
import { NearbyQueryDto } from './nearby.query';
import { type NearbyResponse, toNearbyResponse } from './nearby.response';

@Controller('establishments')
export class EstablishmentsController {
  constructor(private readonly listNearby: ListNearbyEstablishments) {}

  // no-store: la URL lleva la ubicación del usuario y no debe quedar en ninguna caché (EC-08).
  @Get('nearby')
  @Header('Cache-Control', 'no-store')
  async nearby(@Query() query: NearbyQueryDto): Promise<NearbyResponse> {
    return toNearbyResponse(await this.listNearby.execute(query));
  }
}
