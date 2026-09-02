import { Router } from 'express';
import { validateBody } from '../middleware/validate';
import { createApiKeySchema } from '../schemas/apiKey.schema';
import { authenticate, requirePermission } from '../middleware/auth';
import { createApiKey, listApiKeys, revokeApiKey } from '../controllers/apiKey.controller';

export const apiKeyRouter = Router();

apiKeyRouter.post(
  '/api-keys',
  authenticate,
  requirePermission('admin'),
  validateBody(createApiKeySchema),
  createApiKey,
);
apiKeyRouter.get('/api-keys', authenticate, requirePermission('admin'), listApiKeys);
apiKeyRouter.delete('/api-keys/:id', authenticate, requirePermission('admin'), revokeApiKey);
