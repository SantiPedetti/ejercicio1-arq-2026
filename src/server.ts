import { createApp } from './app';
import { env } from './config/env';
import { logger } from './support/logger';

const port = env.PORT;

createApp().listen(port, () => {
  logger.info('Servidor de reservas escuchando', { port });
});
