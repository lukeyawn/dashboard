// Code constants that aren't meant to be changed from the UI (DESIGN §3).
// User settings live in the database instead.

// how long a completing tap waits before it's sent, so it can be cancelled (DESIGN §6.2)
export const PENDING_MS = 5_000;

// notes edited on a tile are saved this long after the last keystroke (docs/BLOCKS.md §6)
export const NOTES_SAVE_MS = 30_000;

// how often widgets refetch their data (DESIGN §6)
export const POLL_MS = 30_000;

// the kiosk's screen goes dark after this long without a touch at night,
// and a new deploy is picked up after this long without one (DESIGN §6.4)
export const IDLE_MS = 5 * 60 * 1000;

// when the kiosk reloads itself each night, to clear slow memory leaks (DESIGN §6.4)
export const NIGHTLY_RELOAD = '04:00';
