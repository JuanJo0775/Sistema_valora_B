// Valores de prueba para que AppModule valide su configuración dentro de Jest.
process.env['PORT'] ??= '3000';
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] ??= 'postgresql://valora:valora@localhost:5432/valora_dev';
process.env['DATABASE_URL_TEST'] ??= 'postgresql://valora:valora@localhost:5432/valora_test';
process.env['SESSION_SECRET'] ??= 'secreto-solo-para-pruebas';
