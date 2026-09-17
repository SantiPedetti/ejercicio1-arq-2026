import { createApp } from './app';
import { logger } from './support/logger';

const port = Number(process.env.PORT ?? 3000);

createApp().listen(port, () => {
  logger.info('Servidor de reservas escuchando', { port });
});
