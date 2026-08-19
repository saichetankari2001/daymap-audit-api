import express, { Express } from 'express';
import { healthRouter } from './routes/health.routes';
import { entryRouter } from './routes/entry.routes';
import { errorHandler } from './middleware/errorHandler';

export function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(healthRouter);
  app.use(entryRouter);
  app.use(errorHandler);
  return app;
}
