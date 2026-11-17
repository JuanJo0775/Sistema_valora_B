import { Controller, Get, Req } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from './app.setup';

@Controller('ip')
class IpController {
  @Get()
  ip(@Req() req: { ip?: string }): { ip: string } {
    return { ip: req.ip ?? 'desconocida' };
  }
}

// ADR-012: en producción la cadena es navegador -> Vercel -> Render -> API. Los límites por IP
// (#16) usan request.ip; sin trust proxy todos los usuarios compartirían la IP del proxy.
async function ipSeenBy(trustProxy: number, forwardedFor: string): Promise<string> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        ignoreEnvFile: true,
        isGlobal: true,
        load: [() => ({ MEDIA_DIR: 'media', TRUST_PROXY: trustProxy })],
      }),
    ],
    controllers: [IpController],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  try {
    const response = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get('/v1/ip')
      .set('X-Forwarded-For', forwardedFor);
    return (response.body as { ip: string }).ip;
  } finally {
    await app.close();
  }
}

describe('configureApp y la IP del cliente detrás de proxies (ADR-012)', () => {
  const clientIp = '203.0.113.7';
  // Vercel pone la IP del cliente; Render añade la IP con la que le llegó Vercel.
  const chain = `${clientIp}, 198.51.100.9`;

  it('con 2 saltos (Vercel y Render) request.ip es la IP real del cliente', async () => {
    expect(await ipSeenBy(2, chain)).toBe(clientIp);
  });

  it('sin trust proxy ignora X-Forwarded-For (no se puede falsear en desarrollo)', async () => {
    expect(await ipSeenBy(0, chain)).not.toBe(clientIp);
  });

  it('un cliente que añade su propio X-Forwarded-For no cambia la IP vista con 2 saltos', async () => {
    expect(await ipSeenBy(2, `10.9.9.9, ${chain}`)).toBe(clientIp);
  });
});
