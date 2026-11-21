import { verificationEmailHtml } from './verification-email-html';

describe('plantilla HTML del correo de verificación', () => {
  // Nada de lo que entra puede cerrar un atributo ni abrir una etiqueta: se escapa antes de ponerlo.
  it('escapa el enlace y la dirección: ni & ni comillas ni < rompen el HTML', () => {
    const html = verificationEmailHtml({
      base: 'https://valora.example/"><script>x</script>',
      link: 'https://valora.example/verificar-correo?token=a&b="c"<d>',
      validHours: 24,
    });

    expect(html).toContain(
      'href="https://valora.example/verificar-correo?token=a&amp;b=&quot;c&quot;&lt;d&gt;"',
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('"c"');
  });
});
