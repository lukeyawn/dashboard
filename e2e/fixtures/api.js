// Mock API data for the layout checks (DESIGN §13). The page's clock is fixed
// at NOW in America/Chicago, so the data is written for that day, with names
// long enough to prove they truncate or wrap instead of breaking a tile.

export const NOW = new Date('2026-09-30T13:35:00-05:00');
const at = time => new Date(`2026-09-30T${time}:00-05:00`).toISOString();
const stamp = '2026-09-30T12:00:00.000Z';
const rows = list => list.map((row, i) => ({ id: i + 1, created_at: stamp, updated_at: stamp, ...row }));
// items Claude added carry the ✦ mark (docs/CONNECTOR.md §6); put on the longest names
const claude_change = { id: 90, at: stamp, actor: 'claude', via: 'claude.ai' };

export const TASKS = rows([
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
].map((name, i) => ({
    name, done_at: null, due: null, effort: null, area: null, notes: null, link: null, source: null,
    priority: i === 1 ? 'high' : i === 9 ? 'low' : 'normal',
    ...(i === 3 && { effort: 'quick' }),
    ...(i === 2 && { claude_change }),
})).concat([
    // the Due soon tile's tasks: overdue, or due within 14 days of the fixed date
    { name: 'Reading response 3', due: '2026-09-28', area: 'RHE 306' },
    { name: 'Linear Algebra problem set 4: eigenvalues and diagonalization', due: '2026-10-01', area: 'M 340L', priority: 'high', effort: 'big', claude_change },
    { name: 'OS Shell project', due: '2026-10-02', area: 'CS 439' },
    { name: 'Stripe online assessment', due: '2026-10-09', area: 'job search' },
    { name: 'Algorithms midterm', due: '2026-10-14', area: 'CS 331' },
].map(t => ({ done_at: null, priority: 'normal', effort: null, notes: null, link: null, source: null, ...t }))));

export const COUNTDOWNS = rows([
    { label: 'Thanksgiving break', target_date: '2026-11-25', pinned: true },
    { label: 'Finals', target_date: '2026-12-10', pinned: false },
]);

export const BIRTHDAYS = [{ id: 'mom@example.com/2026-10-03', title: "Mom's birthday", date: '2026-10-03' }];

export const EVENTS = [
    { id: 'fair', title: 'Career fair', start: '2026-09-30', end: '2026-09-30', all_day: true, location: null, calendar: 'Luke' },
    { id: 'a', title: 'Algorithms lecture', start: at('09:00'), end: at('10:15'), location: 'GDC 2.216' },
    { id: 'b', title: 'Office hours', start: at('11:00'), end: at('12:00'), location: null },
    { id: 'c', title: 'Lunch with Sam', start: at('12:15'), end: at('13:00'), location: 'Kerbey Lane' },
    { id: 'd', title: 'Operating Systems', start: at('13:00'), end: at('14:30'), location: 'UTC 2.112A' },
    { id: 'e', title: 'Gym', start: at('16:30'), end: at('17:30'), location: null },
    { id: 'f', title: 'Study group for the algorithms midterm', start: at('19:00'), end: at('21:00'), location: 'PCL 4th floor, room 4.102' },
].map(e => ({ all_day: false, calendar: 'Luke', ...e }));

export const GOALS = rows([
    { name: 'Read 12 books', current: 7, target: 12, unit: 'books' },
    { name: 'Run 100 miles', current: 64.5, target: 100, unit: 'mi' },
    { name: 'LeetCode problems before internship season', current: 92, target: 150, unit: null },
    { name: 'Internship applications', current: 40, target: 40, unit: null },
    { name: 'Learn 500 hanzi', current: 212, target: 500, unit: null },
].map(g => ({ ...g, archived_at: null })));

const week = ['2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30'];
const pick = pattern => week.filter((_, i) => pattern[i] === 'x');
// weeks start on Sunday (SETTINGS), so this week is Sep 27 to 30
export const HABITS = rows([
    { name: 'Exercise', checks: pick('x.xx.xx'), per_week: 3, week_count: 3, streak: 5 },
    { name: 'Read 30 minutes', checks: pick('xxxxx.x'), streak: 1 },
    { name: 'Chinese practice', checks: pick('xx.xxxx'), streak: 4 },
    { name: 'Sleep by midnight, even on weekends', checks: pick('.xx..x.'), per_week: 5, week_count: 1, streak: 0 },
    { name: 'No phone in bed', checks: pick('x..xxxx'), streak: 4 },
].map((h, i) => ({ per_week: 7, week_count: h.checks.filter(d => d >= '2026-09-27').length, position: i, archived_at: null, ...h })));

export const SETTINGS = { night_start: '22:00', night_end: '06:30', week_start: 'sunday' };

export const APPLICATIONS = rows([
    { company: 'Google', role: 'Software Engineering Intern, Summer 2027', status: 'interview', updated_at: '2026-09-29T15:00:00.000Z', claude_change },
    { company: 'Stripe', role: 'Backend Intern', status: 'applied', updated_at: '2026-09-28T15:00:00.000Z' },
    { company: 'Datadog', role: 'SRE Intern', status: 'applied', updated_at: '2026-09-20T15:00:00.000Z' },
    { company: 'Figma', role: 'Frontend Intern', status: 'applied', updated_at: '2026-09-18T15:00:00.000Z' },
    { company: 'Jane Street', role: 'SWE Intern', status: 'rejected', updated_at: '2026-09-27T15:00:00.000Z' },
    { company: 'Two Sigma', role: 'Quant Dev Intern', status: 'offer', updated_at: '2026-09-10T15:00:00.000Z' },
].map(a => ({ applied_on: '2026-09-01', url: null, notes: null, ...a })));

export const WEATHER = {
    location: { lat: 30.27, lon: -97.74, name: 'Austin, TX', source: 'default' },
    temperature: 82, condition: 'Partly cloudy', high: 92, low: 70, unit: 'F', report_location: false,
};

const FIXTURES = {
    '/api/tasks': () => TASKS,
    '/api/countdowns': () => COUNTDOWNS,
    '/api/goals': () => GOALS,
    '/api/habits': () => HABITS,
    '/api/settings': () => SETTINGS,
    '/api/applications': () => APPLICATIONS,
    '/api/weather': () => WEATHER,
    '/api/session': () => ({ client: 'api' }),
    '/api/status': () => ({ backup: null, calendar: null, problems: [] }),
    '/api/night': () => ({ active: false, early: false, until: null, start: '22:00', end: '06:30' }),
    '/api/events': q => (q.get('from') <= '2026-09-30' && q.get('to') >= '2026-09-30' ? EVENTS : []),
    '/api/birthdays': q => BIRTHDAYS.filter(b => b.date >= q.get('from') && b.date <= q.get('to')),
};

// Fixes the page's clock and answers every API request from the fixtures;
// overrides replaces any of them, e.g. { '/api/tasks': () => [] }
export async function mockApi(page, overrides = {}) {
    await page.clock.setFixedTime(NOW);
    const answers = { ...FIXTURES, ...overrides };
    await page.route('**/api/**', route => {
        const url = new URL(route.request().url());
        const answer = answers[url.pathname];
        if (answer) return route.fulfill({ json: answer(url.searchParams) });
        return route.fulfill({ status: 404, json: { error: { message: `Not mocked: ${url.pathname}`, details: [] } } });
    });
}
