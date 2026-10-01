// Code constants that aren't meant to be changed from the UI (DESIGN §3).
// User settings live in the database instead.

// how long a completing tap waits before it's sent, so it can be cancelled (DESIGN §6.2)
export const PENDING_MS = 5_000;

// how often widgets refetch their data (DESIGN §6)
export const POLL_MS = 30_000;
