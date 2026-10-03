// Mock API data for the layout checks (DESIGN §13). The page's clock is fixed
// at NOW in America/Chicago, so the data is written for that day, with names
// long enough to prove they truncate or wrap instead of breaking a tile.

export const NOW = new Date('2026-09-30T13:35:00-05:00');
const at = (time, date = '2026-09-30') => new Date(`${date}T${time}:00-05:00`).toISOString();
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
    name, done_at: null, due: null, area_id: null, area: null, minutes: null, repeat: null, last_done_at: null, notes: null, link: null, source: null,
    priority: i === 1 ? 'now' : i === 9 ? 'someday' : 'soon',
    ...(i === 3 && { minutes: 15 }),
    // a weekly chore (↻), and a deadline due tomorrow, in --urgent
    ...(i === 0 && { minutes: 120, due: '2026-10-04', repeat: { every: 1, unit: 'week' } }),
    ...(i === 3 && { due: '2026-10-01' }),
    ...(i === 2 && { claude_change }),
})).concat([
    // tasks with a due date: School's are the Assignments tile's (SETTINGS)
    { name: 'Reading response 3', due: '2026-09-28', area_id: 1, area: 'School' },
    { name: 'Linear Algebra problem set 4: eigenvalues and diagonalization', due: '2026-10-01', area_id: 1, area: 'School', priority: 'now', minutes: 120, claude_change },
    { name: 'OS Shell project', due: '2026-10-02', area_id: 1, area: 'School' },
    { name: 'Stripe online assessment', due: '2026-10-09', area_id: 3, area: 'Job search' },
    { name: 'Algorithms midterm', due: '2026-10-14', area_id: 1, area: 'School' },
].map(t => ({ done_at: null, priority: 'soon', minutes: null, repeat: null, last_done_at: null, notes: null, link: null, source: null, ...t }))));

export const AREAS = rows(['School', 'Work', 'Job search', 'Home', 'Health', 'Personal', 'Errands'].map((name, position) => ({ name, position })));

export const COUNTDOWNS = rows([
    { label: 'Thanksgiving break', target_date: '2026-11-25', pinned: true },
    { label: 'Finals', target_date: '2026-12-10', pinned: false },
].map(c => ({ target_time: null, detail: 'days', ...c })));

export const BIRTHDAYS = [{ id: 'mom@example.com/2026-10-03', title: "Mom's birthday", date: '2026-10-03' }];

export const EVENTS = [
    { id: 'fair', title: 'Career fair', start: '2026-09-30', end: '2026-09-30', all_day: true, location: null, calendar: 'Luke' },
    { id: 'a', title: 'Algorithms lecture', start: at('09:00'), end: at('10:15'), location: 'GDC 2.216' },
    { id: 'b', title: 'Office hours', start: at('11:00'), end: at('12:00'), location: null },
    { id: 'c', title: 'Lunch with Sam', start: at('12:15'), end: at('13:00'), location: 'Kerbey Lane' },
    { id: 'd', title: 'Operating Systems', start: at('13:00'), end: at('14:30'), location: 'UTC 2.112A' },
    { id: 'e', title: 'Gym', start: at('16:30'), end: at('17:30'), location: null },
    { id: 'f', title: 'Study group for the algorithms midterm', start: at('19:00'), end: at('21:00'), location: 'PCL 4th floor, room 4.102' },
    // Upcoming's days, Thursday to Sunday: a full Friday, an empty Saturday
    // but for a birthday, and a class, which stays off Upcoming
    { id: 'u1', title: 'Tutoring: calculus with Priya and her study partner', start: at('16:00', '2026-10-01'), end: at('17:00', '2026-10-01') },
    { id: 'u2', title: 'Dentist', start: at('08:30', '2026-10-02'), end: at('09:30', '2026-10-02') },
    { id: 'u3', title: 'Coffee chat with a Stripe engineer', start: at('10:00', '2026-10-02'), end: at('10:30', '2026-10-02') },
    { id: 'u4', title: 'Work on problem set 4', start: at('13:00', '2026-10-02'), end: at('15:00', '2026-10-02') },
    { id: 'u5', title: 'Tutoring', start: at('16:00', '2026-10-02'), end: at('17:00', '2026-10-02') },
    { id: 'u6', title: 'Dinner with the robotics club', start: at('18:30', '2026-10-02'), end: at('20:00', '2026-10-02') },
    { id: 'u7', title: 'Movie night', start: at('21:00', '2026-10-02'), end: at('23:00', '2026-10-02') },
    { id: 'u8', title: 'Linear Algebra', start: at('09:00', '2026-10-01'), end: at('10:15', '2026-10-01'), routine: true },
    { id: 'u9', title: 'Austin City Limits', start: '2026-10-04', end: '2026-10-04', all_day: true },
    { id: 'u10', title: 'Call home', start: at('19:00', '2026-10-04'), end: at('19:30', '2026-10-04') },
].map(e => ({ all_day: false, location: null, calendar: 'Luke', routine: false, ...e }));
// the events between two local dates, as the server answers; the timed ones here all end on the day they start
const chicagoDate = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const eventsBetween = (from, to) => EVENTS.filter(e => (e.all_day ? e.start <= to && e.end >= from : chicagoDate(e.start) >= from && chicagoDate(e.start) <= to));

// nearest deadline first, as the server lists them: one behind its pace, a
// step, progress this week, a milestone, and a dream the tile leaves out
export const GOALS = rows([
    { name: 'Run 100 miles', current: 30, target: 100, unit: 'mi', step: 2.5, started: '2026-08-01', deadline: '2026-10-31', week_gain: 7.5 },
    { name: 'Get an internship offer before the end of the year', kind: 'milestone', current: null, target: null, step: null, deadline: '2026-12-31' },
    { name: 'LeetCode problems before internship season', current: 92, target: 150, unit: null, started: '2026-09-01', deadline: '2027-01-15' },
    { name: 'Internship applications', current: 40, target: 40, unit: null, achieved_at: stamp },
    { name: 'Learn 500 hanzi', current: 212, target: 500, unit: null },
    { name: 'See the northern lights', kind: 'milestone', current: null, target: null, step: null, dream: true },
].map(g => ({ kind: 'progress', unit: null, step: 1, deadline: null, started: '2026-09-01', achieved_at: null, dream: false, week_gain: g.kind === 'milestone' ? null : 0, ...g, archived_at: null })));

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

export const SETTINGS = { night_start: '22:00', night_end: '06:30', week_start: 'sunday', assignments_area: 1 };

// the selected (top) one has long notes, to prove they scroll inside the panel;
// more applied ones than fit, to prove they fold into "+N more"
const NOTES = 'Recruiter: Dana Whitfield. Two rounds: coding (LeetCode medium, arrays and graphs) and a project deep-dive on the OS shell. '.repeat(6);
export const APPLICATIONS = rows([
    { company: 'Google', role: 'Software Engineering Intern, Summer 2027', status: 'interview', next_on: '2026-10-01', next_time: '14:00', url: 'https://careers.google.com/jobs/1', notes: NOTES, claude_change },
    { company: 'Jane Street', role: 'SWE Intern', status: 'oa', next_on: '2026-10-02' },
    { company: 'Two Sigma Investments', role: 'Quant Dev Intern', status: 'offer', next_on: '2026-10-20', url_by_claude: true, url: 'https://evil.example/' },
    { company: 'Stripe', role: 'Backend Intern', status: 'applied', applied_on: '2026-09-28' },
    { company: 'Supercalifragilisticexpialidocious Corp', role: 'SRE Intern', status: 'applied', applied_on: '2026-09-27' },
    { company: 'Figma', role: 'Frontend Intern', status: 'applied', applied_on: '2026-09-20' },
    { company: 'Notion', role: 'SWE Intern', status: 'applied', applied_on: '2026-09-18' },
    { company: 'Ramp', role: 'SWE Intern', status: 'applied', applied_on: '2026-09-15' },
    { company: 'Datadog', role: 'SRE Intern', status: 'applied', applied_on: '2026-09-12' },
    { company: 'Citadel', role: 'SWE Intern', status: 'rejected' },
    { company: 'Palantir', role: 'FDE Intern', status: 'withdrawn' },
].map(a => ({ applied_on: '2026-09-01', url: null, notes: null, next_on: null, next_time: null, url_by_claude: false, source: null, ...a })));

export const WEATHER = {
    location: { lat: 30.27, lon: -97.74, name: 'Austin, TX', source: 'default' },
    temperature: 82, condition: 'Partly cloudy', high: 92, low: 70, unit: 'F', report_location: false,
};

const FIXTURES = {
    '/api/tasks': () => TASKS,
    '/api/countdowns': () => COUNTDOWNS,
    '/api/areas': () => AREAS,
    '/api/goals': q => GOALS.filter(g => q.get('dream') !== 'false' || !g.dream),
    '/api/habits': () => HABITS,
    '/api/settings': () => SETTINGS,
    '/api/applications': () => APPLICATIONS,
    '/api/weather': () => WEATHER,
    '/api/session': () => ({ client: 'api' }),
    '/api/status': () => ({ backup: null, calendar: null, problems: [] }),
    '/api/night': () => ({ active: false, early: false, until: null, start: '22:00', end: '06:30' }),
    '/api/events': q => eventsBetween(q.get('from'), q.get('to')),
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
