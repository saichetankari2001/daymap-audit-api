import { EntryRepository, EntryPage } from '../repositories/entry.repository';
import { CreateEntryInput, EntryQueryInput } from '../schemas/entry.schema';

export const EntryService = {
  createBatch(entries: CreateEntryInput[]): Promise<void> {
    return EntryRepository.createBatch(entries);
  },

  query(filters: EntryQueryInput): Promise<EntryPage> {
    return EntryRepository.findMany(filters);
  },
};
