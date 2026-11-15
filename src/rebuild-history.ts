import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PRICE_HISTORY_CONSUMER, PRICE_HISTORY_EVENTS } from './modules/comparison';
import { OutboxRelay } from './shared/events';

// Grill de la #83, pregunta 6: llena el historial de precios con los eventos que se entregaron antes
// de que existiera. Se puede correr varias veces: los ya aplicados se saltan.
export async function rebuildHistory(relay: OutboxRelay): Promise<string> {
  const reviewed = await relay.redeliver(PRICE_HISTORY_EVENTS, PRICE_HISTORY_CONSUMER);
  return `Historial reconstruido: ${String(reviewed)} eventos revisados.`;
}

async function main(): Promise<void> {
  const logger = new Logger('Historial');
  const context = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    logger.log(await rebuildHistory(context.get(OutboxRelay)));
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await context.close();
  }
}

// Solo al ejecutarlo como comando; las pruebas importan rebuildHistory.
if (require.main === module) void main();
