// Errors that become JSON responses: { error: { message, details } } (DESIGN §4)
export class HttpError extends Error {
    constructor(status, message, details = []) {
        super(message);
        this.status = status;
        this.details = details;
    }
}

// Validates a value against a zod schema, or throws a 400 listing every problem
export function validate(schema, value) {
    const result = schema.safeParse(value);
    if (result.success) return result.data;
    const details = result.error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
    }));
    throw new HttpError(400, 'Invalid request', details);
}

// The last middleware: turns anything thrown into the error shape
// eslint-disable-next-line no-unused-vars -- Express recognises error handlers by their four arguments
export function errorHandler(err, req, res, next) {
    let status = err instanceof HttpError ? err.status : (err.status ?? err.statusCode ?? 500);
    if (status < 400 || status > 599) status = 500;
    // body-parser errors carry a status, but their messages aren't written for clients
    const message = err instanceof HttpError ? err.message
        : status === 500 ? 'Something went wrong on the server'
        : err.type === 'entity.parse.failed' ? 'The request body is not valid JSON'
        : 'Invalid request';
    if (status === 500) console.error(err);
    res.status(status).json({ error: { message, details: err.details ?? [] } });
}
