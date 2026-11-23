// Correo de bienvenida (ADR-036): informativo, sin promoción ni seguimiento. HTML de correo: tablas y
// estilos en línea, sin hojas de estilo ni fuentes propias. Los colores son los de la PWA (tokens.css).
export interface WelcomeEmailContent {
  // La dirección pública de la PWA, sin barra final.
  base: string;
  // Nombre visible de la persona; solo se usa el primero. null o vacío: «Hola».
  displayName: string | null;
  // Nombre del remitente configurado (EMAIL_FROM), para la despedida. null: «El equipo de Valora».
  senderName: string | null;
}

export interface WelcomeEmail {
  subject: string;
  text: string;
  html: string;
}

export const WELCOME_SUBJECT = 'Te damos la bienvenida a Valora';

// Lo que entra en atributos y texto se escapa: nada puede cerrar un atributo ni abrir una etiqueta.
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

// Solo el primer nombre: «Ana María Gómez» es «Ana».
export function firstNameOf(displayName: string | null): string | null {
  const first = displayName?.trim().split(/\s+/, 1)[0];
  return first ? first : null;
}

// De `Valora <no-responder@valora.co>` saca «Valora»; sin nombre (solo la dirección) no hay remitente
// que mostrar, para no poner una dirección en la despedida.
export function senderNameOf(from: string | undefined): string | null {
  const open = from?.indexOf('<') ?? -1;
  if (!from || open <= 0) return null;
  const name = from.slice(0, open).trim().replaceAll('"', '');
  return name === '' ? null : name;
}

const STEPS = [
  'Busca un producto y mira dónde está más barato.',
  'Registra un precio cuando lo veas en una tienda: así ayudas a tu barrio.',
  'Arma tu canasta y mira dónde comprar.',
];
const ABOUT =
  'Valora compara los precios de la canasta básica en las tiendas de Armenia y el Quindío. Los precios los pone la comunidad.';
const PRIVACY =
  'Tu nombre y tu ubicación nunca se publican; puedes eliminar tu cuenta cuando quieras en Ajustes › Opciones avanzadas.';
const WHY =
  'Recibes este correo porque creaste una cuenta en Valora con este correo. Es un aviso informativo y no lleva promociones. Si no fuiste tú, escribe al canal de contacto de la política de datos:';

export function welcomeEmail(content: WelcomeEmailContent): WelcomeEmail {
  const first = firstNameOf(content.displayName);
  const greeting = first ? `Hola ${first},` : 'Hola,';
  const sender = content.senderName ?? 'El equipo de Valora';
  const privacyUrl = `${content.base}/privacidad`;
  const text = [
    greeting,
    '',
    'Te damos la bienvenida a Valora.',
    ABOUT,
    '',
    'Para empezar:',
    ...STEPS.map((step, index) => `${String(index + 1)}. ${step}`),
    '',
    `Abrir Valora: ${content.base}`,
    '',
    PRIVACY,
    `Política de datos: ${privacyUrl}`,
    '',
    'Gracias por sumarte.',
    sender,
    '',
    WHY,
    privacyUrl,
  ].join('\n');

  const appHref = escapeHtml(content.base);
  const privacyHref = escapeHtml(privacyUrl);
  const font = 'font-family:Arial,Helvetica,sans-serif;';
  const steps = STEPS.map(
    (step, index) =>
      `<tr><td valign="top" style="padding:0 12px 10px 0;${font}font-size:16px;line-height:1.5;font-weight:700;color:#b84b0b;">${String(index + 1)}.</td><td style="padding:0 0 10px 0;${font}font-size:16px;line-height:1.5;color:#17140f;">${escapeHtml(step)}</td></tr>`,
  ).join('\n');
  const html = `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(WELCOME_SUBJECT)}</title></head>
<body style="margin:0;padding:0;background:#f6f5f3;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f3;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #ece9e5;border-radius:14px;${font}color:#17140f;">
<tr><td style="padding:28px 32px 0 32px;${font}font-size:20px;font-weight:700;color:#b84b0b;">Valora</td></tr>
<tr><td style="padding:20px 32px 0 32px;">
<h1 style="margin:0;${font}font-size:22px;line-height:1.3;font-weight:700;color:#17140f;">${escapeHtml(greeting)}</h1>
<p style="margin:12px 0 0 0;${font}font-size:16px;line-height:1.5;color:#17140f;">Te damos la bienvenida a Valora.</p>
<p style="margin:8px 0 0 0;${font}font-size:16px;line-height:1.5;color:#5e5850;">${escapeHtml(ABOUT)}</p>
</td></tr>
<tr><td style="padding:24px 32px 0 32px;">
<p style="margin:0 0 12px 0;${font}font-size:16px;line-height:1.5;font-weight:700;color:#17140f;">Para empezar</p>
<table role="presentation" cellpadding="0" cellspacing="0">
${steps}
</table>
</td></tr>
<tr><td style="padding:14px 32px 0 32px;"><a href="${appHref}" title="Abrir Valora" style="display:inline-block;background:#f26a1b;color:#1a0e04;${font}font-size:16px;font-weight:700;text-decoration:none;padding:14px 24px;border-radius:14px;">Abrir Valora</a></td></tr>
<tr><td style="padding:24px 32px 0 32px;"><p style="margin:0;${font}font-size:14px;line-height:1.5;color:#5e5850;">${escapeHtml(PRIVACY)} <a href="${privacyHref}" style="color:#b84b0b;">Política de datos</a></p></td></tr>
<tr><td style="padding:20px 32px 0 32px;"><p style="margin:0;${font}font-size:16px;line-height:1.5;color:#17140f;">Gracias por sumarte.<br>${escapeHtml(sender)}</p></td></tr>
<tr><td style="padding:24px 32px 28px 32px;"><p style="margin:0;padding-top:16px;border-top:1px solid #ece9e5;${font}font-size:13px;line-height:1.5;color:#736c64;">${escapeHtml(WHY)} <a href="${privacyHref}" style="color:#b84b0b;">${privacyHref}</a></p></td></tr>
</table>
</td></tr></table>
</body>
</html>`;
  return { subject: WELCOME_SUBJECT, text, html };
}
