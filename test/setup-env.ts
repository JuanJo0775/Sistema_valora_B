// Valores de prueba para que AppModule valide su configuración dentro de Jest.
process.env['PORT'] ??= '3000';
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] ??= 'postgresql://valora:valora@localhost:5432/valora_dev';
process.env['DATABASE_URL_TEST'] ??= 'postgresql://valora:valora@localhost:5432/valora_test';
process.env['SESSION_SECRET'] ??= 'secreto-solo-para-pruebas';
process.env['REPORTER_KEY_SECRET'] ??= 'clave-de-reportante-solo-para-pruebas';
// Issue #69: en las pruebas el repartidor automático del outbox no corre (una hora); cada prueba lo
// llama a mano con runOnce(). Con 5 segundos competía con esos runOnce() y con los truncate, y una
// prueba podía ver la base a medio camino. outbox-scheduler.spec.ts pone su propio intervalo.
process.env['OUTBOX_POLL_INTERVAL_MS'] ??= '3600000';
process.env['OUTBOX_MAX_ATTEMPTS'] ??= '5';
