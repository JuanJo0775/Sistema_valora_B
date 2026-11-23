import { IsInt, IsUUID } from 'class-validator';

// Cuerpo de PUT /v1/commerce/prices (#203). El piso y el techo los revisa la regla de ADR-030.
export class PublishOfficialPriceDto {
  @IsUUID('all', { message: 'debe ser un id válido' })
  presentationId!: string;

  @IsInt({ message: 'debe ser un número entero de pesos' })
  priceCop!: number;
}
