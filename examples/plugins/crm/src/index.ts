import app from './app.js';
import logger from './logger.js';

const port = Number(process.env['PORT']) || 3000;

try {
  await app.listen({ port, host: '0.0.0.0' });
  logger.info({ port }, 'CRM plugin backend started');
} catch (err) {
  logger.error(err, 'Failed to start server');
  process.exit(1);
}
