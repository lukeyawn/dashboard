// Mock API data for the layout checks (DESIGN §13), including names long enough
// to prove they truncate or wrap instead of breaking a tile.
export const TASKS = [
    'Do laundry',
    'Finish OS Shell project',
    'Email Professor Alvarez about the regrade request for problem set three, part (b), and ask about office hours next week',
    'Renew library books',
    'Supercalifragilisticexpialidociousantidisestablishmentarianism',
    'Call the bank',
    'Book flights for Thanksgiving',
    'Pick up prescription',
    'Write cover letter for Stripe',
    'Clean desk',
    'Back up laptop',
    'Return Amazon package',
].map((name, i) => ({ id: i + 1, name, done_at: null, created_at: '2026-09-30T12:00:00.000Z', updated_at: '2026-09-30T12:00:00.000Z' }));

export async function mockApi(page, { tasks = TASKS } = {}) {
    await page.route('**/api/**', route => {
        const { pathname } = new URL(route.request().url());
        if (pathname === '/api/tasks') return route.fulfill({ json: tasks });
        return route.fulfill({ status: 404, json: { error: { message: `Not mocked: ${pathname}`, details: [] } } });
    });
}
