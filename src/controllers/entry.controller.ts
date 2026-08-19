import { RequestHandler } from 'express';
import { EntryService } from '../services/entry.service';
import { CreateEntryInput, EntryQueryInput } from '../schemas/entry.schema';

export const createEntries: RequestHandler = async (req, res, next) => {
  try {
    const body = req.body as CreateEntryInput | CreateEntryInput[];
    const entries = Array.isArray(body) ? body : [body];
    await EntryService.createBatch(entries);
    res.status(201).json({ accepted: entries.length });
  } catch (err) {
    next(err);
  }
};

export const listEntries: RequestHandler = async (req, res, next) => {
  try {
    const result = await EntryService.query(req.query as unknown as EntryQueryInput);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
