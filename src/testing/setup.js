// Runs before every test file. Testing Library only unmounts between tests on
// its own when test globals are on, which they aren't here.
import { afterEach } from 'vitest';

if (typeof document !== 'undefined') {
    const { cleanup } = await import('@testing-library/react');
    afterEach(() => cleanup());
}
