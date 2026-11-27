import { firstNameOf, senderNameOf, welcomeEmail, WELCOME_SUBJECT } from './welcome-email';

const base = 'https://valora.example';
const build = (displayName: string | null, senderName: string | null = 'Valora') =>
  welcomeEmail({ base, displayName, senderName });

describe('correo de bienvenida (ADR-036)', () => {
  it('lleva el asunto acordado', () => {
    expect(build('Ana').subject).toBe('Te damos la bienvenida a Valora');
    expect(WELCOME_SUBJECT).toBe('Te damos la bienvenida a Valora');
  });

  it('saluda solo con el primer nombre y, sin nombre, con «Hola»', () => {
    expect(build('Ana María Gómez').text.startsWith('Hola Ana,\n')).toBe(true);
    expect(build('Ana María Gómez').html).toContain('Hola Ana,');
    expect(build(null).text.startsWith('Hola,\n')).toBe(true);
    expect(build('   ').text.startsWith('Hola,\n')).toBe(true);
  });

  it('el texto plano trae los 3 pasos, el enlace de la app y el de privacidad', () => {
    const { text } = build('Ana');
    expect(text).toContain('1. Busca un producto y mira dónde está más barato.');
    expect(text).toContain('2. Registra un precio');
    expect(text).toContain('3. Arma tu canasta y mira dónde comprar.');
    expect(text).toContain(`Abrir Valora: ${base}`);
    expect(text).toContain(`${base}/privacidad`);
    expect(text).toContain('Tu nombre y tu ubicación nunca se publican');
    expect(text).toContain('Ajustes › Opciones avanzadas');
    expect(text).toContain('Valora compara los precios de la canasta básica');
  });

  it('el botón y el enlace de privacidad del HTML apuntan a APP_URL', () => {
    const { html } = build('Ana');
    expect(html).toContain(`<a href="${base}" title="Abrir Valora"`);
    expect(html).toContain(`href="${base}/privacidad"`);
    expect(html).toContain('max-width:560px');
    expect(html).toContain('#f26a1b');
  });

  it('lleva el logo de Valora y ninguna otra imagen', () => {
    const { html } = build('Ana');
    expect(html).toContain(`<img src="${base}/logo-horizontal-claro.png"`);
    expect(html.match(/<img[\s>]/g)).toHaveLength(1);
  });

  it('no lleva enlaces de baja ni de seguimiento ni imágenes externas', () => {
    const { html, text } = build('Ana');
    expect(`${html}${text}`).not.toMatch(/unsubscribe|darse de baja|utm_/i);
    const srcs = [...html.matchAll(/src="([^"]+)"/g)].map((match) => match[1]);
    expect(srcs.every((src) => src?.startsWith(base))).toBe(true);
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    expect(hrefs.every((href) => href?.startsWith(base))).toBe(true);
  });

  it('se despide con el remitente configurado o, sin él, con el equipo', () => {
    expect(build('Ana', 'Valora').text).toContain('Gracias por sumarte.\nValora');
    expect(build('Ana', null).text).toContain('Gracias por sumarte.\nEl equipo de Valora');
  });

  it('escapa el nombre contra HTML y no lo deja abrir etiquetas ni atributos', () => {
    const { html, text } = build('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Hola &lt;script&gt;alert(1)&lt;/script&gt;,');
    // El texto plano no interpreta HTML: lleva el nombre tal cual.
    expect(text).toContain('Hola <script>alert(1)</script>,');
    const quoted = build('"onmouseover="x"');
    expect(quoted.html).not.toContain('"onmouseover="x"');
    expect(quoted.html).toContain('&quot;onmouseover=&quot;x&quot;');
    expect(build("O'Neil").html).toContain('Hola O&#39;Neil,');
  });

  it('escapa también el nombre del remitente', () => {
    expect(build('Ana', 'A&B <x>').html).toContain('A&amp;B &lt;x&gt;');
  });

  it('no deja etiquetas abiertas', () => {
    const { html } = build('Ana');
    for (const tag of ['table', 'tr', 'td', 'p', 'a', 'h1', 'html', 'head', 'body']) {
      const opens = html.match(new RegExp(`<${tag}[\\s>]`, 'g'))?.length ?? 0;
      const closes = html.match(new RegExp(`</${tag}>`, 'g'))?.length ?? 0;
      expect({ tag, opens }).toEqual({ tag, opens: closes });
    }
  });

  it.each([
    ['Ana María', 'Ana'],
    ['  Beto  ', 'Beto'],
    ['', null],
    [null, null],
  ])('firstNameOf(%j) es %j', (input, expected) => {
    expect(firstNameOf(input)).toBe(expected);
  });

  it.each([
    ['Valora <no-responder@valora.co>', 'Valora'],
    ['"Equipo Valora" <a@valora.co>', 'Equipo Valora'],
    ['a@valora.co', null],
    ['<a@valora.co>', null],
    [undefined, null],
  ])('senderNameOf(%j) es %j', (input, expected) => {
    expect(senderNameOf(input)).toBe(expected);
  });
});
