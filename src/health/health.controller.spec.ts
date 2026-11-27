import { HealthController } from './health.controller';

// #23: el despliegue necesita saber qué versión sirve Render, porque mientras construye la nueva
// sigue respondiendo la anterior y /v1/health responde igual con las dos.
describe('GET /v1/health', () => {
  const original = process.env['RENDER_GIT_COMMIT'];

  afterEach(() => {
    if (original === undefined) delete process.env['RENDER_GIT_COMMIT'];
    else process.env['RENDER_GIT_COMMIT'] = original;
  });

  it('fuera de Render responde solo el estado', () => {
    delete process.env['RENDER_GIT_COMMIT'];

    expect(new HealthController().check()).toEqual({ status: 'ok' });
  });

  it('en Render dice los 7 primeros caracteres del commit que sirve', () => {
    process.env['RENDER_GIT_COMMIT'] = '0f8b3d2c9a1e4b5d6f708192a3b4c5d6e7f80910';

    expect(new HealthController().check()).toEqual({ status: 'ok', commit: '0f8b3d2' });
  });

  it('un valor que no es un commit no se repite en la respuesta', () => {
    process.env['RENDER_GIT_COMMIT'] = '<script>alert(1)</script>';

    expect(new HealthController().check()).toEqual({ status: 'ok' });
  });
});
