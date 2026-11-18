import { Controller, Get, Header } from '@nestjs/common';
import { CACHE_STATIC } from '../../../shared/http/cache-control';
import type { CategoryView } from '../application/product-repository';
import { ListCategories } from '../application/list-categories';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly listCategories: ListCategories) {}

  // #111: la lista solo cambia con una migración; caché pública de una hora (EC-04).
  @Get()
  @Header('Cache-Control', CACHE_STATIC)
  async list(): Promise<{ items: CategoryView[] }> {
    const items = await this.listCategories.execute();
    return { items: items.map(({ code, name }) => ({ code, name })) };
  }
}
