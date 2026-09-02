import { RequestHandler } from 'express';
import { ApiKeyService } from '../services/apiKey.service';
import { CreateApiKeyInput } from '../schemas/apiKey.schema';

export const createApiKey: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await ApiKeyService.issue(req.body as CreateApiKeyInput));
  } catch (err) {
    next(err);
  }
};

export const listApiKeys: RequestHandler = async (_req, res, next) => {
  try {
    res.status(200).json(await ApiKeyService.list());
  } catch (err) {
    next(err);
  }
};

export const revokeApiKey: RequestHandler = async (req, res, next) => {
  try {
    await ApiKeyService.revoke(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};
