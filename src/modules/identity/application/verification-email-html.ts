// Correo de verificación con estilo (aprobado por el equipo el 21-nov-2026). HTML de correo: tablas y
// estilos en línea, porque los lectores de correo no cargan hojas de estilo ni fuentes propias. Los
// colores son los de la PWA (tokens.css). Sin datos de la persona: ni su correo ni su nombre (ADR-029).
export interface VerificationEmailContent {
  // La dirección pública de la PWA, sin barra final.
  base: string;
  link: string;
  validHours: number;
}

// Lo que entra en atributos y texto se escapa: nada puede cerrar un atributo ni abrir una etiqueta.
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function verificationEmailHtml(content: VerificationEmailContent): string {
  const base = escapeHtml(content.base);
  const link = escapeHtml(content.link);
  const validHours = content.validHours;
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Verifica tu correo en Valora</title></head>
<body style="margin:0;padding:0;background:#f6f5f3;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f3;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #ece9e5;border-radius:14px;font-family:Arial,Helvetica,sans-serif;color:#17140f;">
<tr><td style="padding:28px 32px 0 32px;"><img src="${base}/logo-horizontal-claro.png" width="120" height="40" alt="Valora" style="display:block;border:0;width:120px;height:40px;"></td></tr>
<tr><td style="padding:20px 32px 0 32px;">
<h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:700;color:#17140f;">Confirma tu correo</h1>
<p style="margin:12px 0 0 0;font-size:16px;line-height:1.5;color:#5e5850;">Hola. Para registrar precios en Valora necesitamos comprobar que este correo es tuyo.</p>
</td></tr>
<tr><td style="padding:24px 32px 0 32px;"><a href="${link}" style="display:inline-block;background:#f06a1a;color:#1a0e04;font-size:16px;font-weight:700;text-decoration:none;padding:14px 24px;border-radius:14px;">Verificar mi correo</a></td></tr>
<tr><td style="padding:24px 32px 0 32px;"><p style="margin:0;font-size:13px;line-height:1.5;color:#736c64;">Si el botón no funciona, copia este enlace en tu navegador:<br><a href="${link}" style="color:#b84b0b;word-break:break-all;">${link}</a></p></td></tr>
<tr><td style="padding:24px 32px 28px 32px;"><p style="margin:0;padding-top:16px;border-top:1px solid #ece9e5;font-size:13px;line-height:1.5;color:#736c64;">El enlace vale ${String(validHours)} horas y solo se puede usar una vez. Si no creaste una cuenta en Valora, ignora este mensaje.</p></td></tr>
</table>
<p style="margin:16px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#736c64;">Valora · Compara precios en Armenia y el Quindío</p>
</td></tr></table>
</body>
</html>`;
}
