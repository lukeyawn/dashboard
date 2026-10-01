// Request schemas shared by the API, the frontend and the MCP server, so every
// way of putting data in goes through the same validation (DESIGN §4, §5).
import { z } from 'zod';

const name = z.string().trim().min(1, 'Name is required').max(200, 'Name is too long');
const timestamp = z.iso.datetime({ message: 'Expected a UTC ISO-8601 timestamp' });

export const id = z.coerce.number().int().positive();

const doneFilter = z.enum(['true', 'false']).transform(value => value === 'true');

const notEmpty = [object => Object.keys(object).length > 0, { message: 'Nothing to update' }];

export const taskCreate = z.strictObject({ name });

export const taskUpdate = z.strictObject({
    name: name.optional(),
    // set to complete the task, null to restore it
    done_at: timestamp.nullable().optional(),
}).refine(...notEmpty);

export const taskQuery = z.strictObject({ done: doneFilter.optional() });

export const login = z.strictObject({ token: z.string().min(1).max(512) });
