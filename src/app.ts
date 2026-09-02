import express, { Express } from 'express';
import path from 'path';
import { healthRouter } from './routes/health.routes';
import { entryRouter } from './routes/entry.routes';
import { apiKeyRouter } from './routes/apiKey.routes';
import { archivalRouter } from './routes/archival.routes';
import { errorHandler } from './middleware/errorHandler';

export function createApp(): Express {
  const app = express();
  app.use(express.json());
  // Dev/demo convenience only: serves public/dashboard.html same-origin so it
  // can call the API without needing CORS. Not part of the API contract.
  app.use(express.static(path.join(__dirname, '../public')));
  app.use(healthRouter);
  app.use(entryRouter);
  app.use(apiKeyRouter);
  app.use(archivalRouter);
  app.use(errorHandler);
  return app;
}
