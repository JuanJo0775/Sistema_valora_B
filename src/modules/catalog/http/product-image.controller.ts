import {
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RequestValidationError } from '../../../shared/http/validation';
import { Roles, SessionGuard } from '../../identity';
import { InvalidImageError } from '../application/product-image';
import type { ProductImage } from '../application/product-repository';
import { SetProductImage } from '../application/set-product-image';

// ADR-020: hasta 2 MB por foto.
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

// Lo que usa del archivo que entrega multer (en memoria).
interface UploadedPhoto {
  buffer: Buffer;
}

// ADR-020 (#88): en el Corte 2 solo el moderador sube fotos de producto.
@Controller('moderation/products')
export class ProductImageController {
  constructor(private readonly setProductImage: SetProductImage) {}

  @Put(':productId/image')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  @Roles('moderador')
  // Más de 2 MB: multer corta la subida y responde 413.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } }))
  async upload(
    @Param(
      'productId',
      new ParseUUIDPipe({
        exceptionFactory: () => new RequestValidationError('productId: debe ser un UUID'),
      }),
    )
    productId: string,
    @UploadedFile() file: UploadedPhoto | undefined,
  ): Promise<ProductImage> {
    if (!file) throw new RequestValidationError('file: falta la foto');
    try {
      const image = await this.setProductImage.execute(productId, file.buffer);
      if (!image) throw new NotFoundException();
      return image;
    } catch (error) {
      if (error instanceof InvalidImageError) {
        throw new RequestValidationError(`file: ${error.message}`);
      }
      throw error;
    }
  }
}
