// Spike #256: servidor mínimo para probar Web Push. NO es código de producción y no se mezcla en dev.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import webpush from 'web-push';

if (existsSync('.env.spike')) process.loadEnvFile('.env.spike');
const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:equipo@valora.example';
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('Faltan las claves VAPID. Corre primero: node generate-keys.mjs');
  process.exit(1);
}
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const PORT = Number(process.env.PORT ?? 4000);
// /send exige este código para que nadie más dispare avisos si se expone con un túnel.
const TOKEN = process.env.SPIKE_TOKEN ?? randomBytes(4).toString('hex');
const FILE = 'subscriptions.json';
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/sw.js': ['sw.js', 'text/javascript; charset=utf-8'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
  '/icon-192.png': ['icon-192.png', 'image/png'],
};

const load = async () => (existsSync(FILE) ? JSON.parse(await readFile(FILE, 'utf8')) : []);
const save = (subs) => writeFile(FILE, JSON.stringify(subs, null, 2));
const body = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
};
const json = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
};

createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && STATIC[pathname]) {
      const [file, type] = STATIC[pathname];
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      return res.end(await readFile(file));
    }
    if (req.method === 'GET' && pathname === '/vapid') {
      return json(res, 200, { publicKey: VAPID_PUBLIC_KEY });
    }
    if (req.method === 'POST' && pathname === '/subscribe') {
      const sub = await body(req);
      if (typeof sub.endpoint !== 'string') return json(res, 400, { error: 'suscripción inválida' });
      const subs = (await load()).filter((s) => s.endpoint !== sub.endpoint);
      await save([...subs, { ...sub, savedAt: new Date().toISOString() }]);
      return json(res, 201, { total: subs.length + 1 });
    }
    if (req.method === 'POST' && pathname === '/send') {
      if (req.headers['x-token'] !== TOKEN) return json(res, 403, { error: 'código incorrecto' });
      const { title = 'Valora', text = 'Prueba de aviso' } = await body(req);
      const results = [];
      let subs = await load();
      for (const sub of subs) {
        const sentAt = Date.now();
        const payload = JSON.stringify({ title, text, sentAt });
        try {
          // TTL corto y urgencia alta: un aviso de moderación no sirve horas después.
          const r = await webpush.sendNotification(sub, payload, { TTL: 60, urgency: 'high' });
          results.push({ host: new URL(sub.endpoint).host, status: r.statusCode, ms: Date.now() - sentAt });
        } catch (error) {
          const status = error.statusCode ?? 0;
          results.push({ host: new URL(sub.endpoint).host, status, error: String(error.body ?? error.message) });
          // 404 y 410: la suscripción ya no existe; es lo que borraría el módulo real.
          if (status === 404 || status === 410) subs = subs.filter((s) => s.endpoint !== sub.endpoint);
        }
      }
      await save(subs);
      return json(res, 200, { results });
    }
    json(res, 404, { error: 'no existe' });
  } catch (error) {
    json(res, 500, { error: String(error.message ?? error) });
  }
}).listen(PORT, () => {
  console.log(`Spike en http://localhost:${PORT}`);
  console.log(`Código para enviar avisos: ${TOKEN}`);
});
