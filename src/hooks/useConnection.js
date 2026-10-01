import { useSyncExternalStore } from 'react';
import { getOfflineSince, onConnectionChange } from '../lib/api';

// When the server stopped answering, or null while it answers (DESIGN §6.4)
export function useOfflineSince() {
    return useSyncExternalStore(onConnectionChange, getOfflineSince);
}
