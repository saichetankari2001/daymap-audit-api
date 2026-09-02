import { Router } from 'express';
import { validateBody, validateQuery } from '../middleware/validate';
import {
  createEntrySchema,
  createEntryBatchSchema,
  entryQuerySchema,
} from '../schemas/entry.schema';
import { createEntries, listEntries } from '../controllers/entry.controller';
import { authenticate, requirePermission } from '../middleware/auth';
import { z } from 'zod';

export const entryRouter = Router();

// Accepts either a single entry object or an array of entries.
const createRequestSchema = z.union([createEntrySchema, createEntryBatchSchema]);

entryRouter.post(
  '/entries',
  authenticate,
  requirePermission('write'),
  validateBody(createRequestSchema),
  createEntries,
);
entryRouter.get(
  '/entries',
  authenticate,
  requirePermission('read'),
  validateQuery(entryQuerySchema),
  listEntries,
);
