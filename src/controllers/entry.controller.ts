import { RequestHandler } from 'express';
import { EntryService } from '../services/entry.service';
import { CreateEntryInput, EntryQueryInput } from '../schemas/entry.schema';
import { keyCanAccess, scopeWhereClause } from '../middleware/auth';
import { ForbiddenError } from '../errors/AppError';

export const createEntries: RequestHandler = async (req, res, next) => {
  try {
    const body = req.body as CreateEntryInput | CreateEntryInput[];
    const entries = Array.isArray(body) ? body : [body];
    const key = req.apiKey!;

    for (const entry of entries) {
      if (!keyCanAccess(key, entry.tenantId, entry.schoolId)) {
        throw new ForbiddenError(
          `This key is not scoped for tenant "${entry.tenantId}" / school "${entry.schoolId}"`,
        );
      }
    }

    await EntryService.createBatch(entries);
    res.status(201).json({ accepted: entries.length });
  } catch (err) {
    next(err);
  }
};

export const listEntries: RequestHandler = async (req, res, next) => {
  try {
    const result = await EntryService.query(
      req.query as unknown as EntryQueryInput,
      scopeWhereClause(req.apiKey!),
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
