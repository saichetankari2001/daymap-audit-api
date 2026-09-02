import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { authenticate, requirePermission } from '../middleware/auth';
import { loadArchivalConfig } from '../config/archival';
import { runArchivalPass } from '../jobs/archival/archive';

export const archivalRouter = Router();

archivalRouter.post(
  '/admin/archive',
  authenticate,
  requirePermission('admin'),
  async (_req, res, next) => {
    try {
      res.status(200).json(await runArchivalPass(loadArchivalConfig()));
    } catch (err) {
      next(err);
    }
  },
);

archivalRouter.get(
  '/admin/cold-storage',
  authenticate,
  requirePermission('admin'),
  async (_req, res, next) => {
    try {
      const config = loadArchivalConfig();
      const files = await fs
        .readdir(config.coldStorageDir)
        .then((f) => f.filter((name) => name.endsWith('.jsonl')))
        .catch(() => []);

      const details = await Promise.all(
        files.map(async (file) => {
          const contents = await fs.readFile(path.join(config.coldStorageDir, file), 'utf-8');
          const entryCount = contents.split('\n').filter(Boolean).length;
          return { file, day: file.replace('.jsonl', ''), entryCount };
        }),
      );

      res.status(200).json({
        retentionDays: config.retentionDays,
        files: details.sort((a, b) => b.day.localeCompare(a.day)),
      });
    } catch (err) {
      next(err);
    }
  },
);
