import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { openApiDocument } from './config/swagger.js';
import { router } from './routes/index.js';
import { errorHandler, notFound } from './middleware/error.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  if (env.nodeEnv !== 'test') app.use(morgan('dev'));

  app.get('/health', (_req, res) => res.json({ status: 'ok', demoMode: env.demoMode, asterisk: env.asterisk.mode }));

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
  app.get('/api/openapi.json', (_req, res) => res.json(openApiDocument));

  app.use('/api', router);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
