import Page from './components/Page';
import Dashboard from './components/Dashboard';
import WidgetShell from './components/WidgetShell';
import Dock from './components/Dock';
import CalendarWidget from './widgets/calendar/CalendarWidget';
import CountdownWidget from './widgets/countdown/CountdownWidget';
import DeadlinesWidget from './widgets/deadlines/DeadlinesWidget';
import GoalsWidget from './widgets/goals/GoalsWidget';
import HabitsWidget from './widgets/habits/HabitsWidget';
import JobWidget from './widgets/job/JobWidget';
import TasksWidget from './widgets/tasks/TasksWidget';
import TimelineWidget from './widgets/timeline/TimelineWidget';
import WordOfTheDayWidget from './widgets/wotd/WordOfTheDayWidget';

// placeholder data until these come from real sources
const applications = [
    {id: 1, company: "Google", role: "SWE Intern", status: "interview"},
    {id: 2, company: "Stripe", role: "Backend Intern", status: "applied"},
    {id: 3, company: "Datadog", role: "SRE Intern", status: "applied"},
    {id: 4, company: "Figma", role: "Frontend Intern", status: "applied"},
    {id: 5, company: "Jane Street", role: "SWE Intern", status: "rejected"},
];

const goals = [
    {id: 1, name: "Read 12 books", current: 7, target: 12},
    {id: 2, name: "Run 100 miles", current: 64, target: 100, unit: "mi"},
    {id: 3, name: "LeetCode problems", current: 92, target: 150},
    {id: 4, name: "Internship apps", current: 23, target: 40},
];

const habits = [
    {id: 1, name: "Exercise", days: [true, false, true, true, false, true, true]},
    {id: 2, name: "Read 30 min", days: [true, true, true, true, true, false, true]},
    {id: 3, name: "Chinese practice", days: [true, true, false, true, true, true, true]},
    {id: 4, name: "Sleep by midnight", days: [false, true, true, false, false, true, false]},
    {id: 5, name: "No phone in bed", days: [true, false, false, true, true, true, true]},
];

const events = [
    {id: 1, time: "09:00", title: "Algorithms lecture"},
    {id: 2, time: "11:00", title: "Office hours"},
    {id: 3, time: "12:30", title: "Lunch"},
    {id: 4, time: "14:00", title: "Operating Systems"},
    {id: 5, time: "16:30", title: "Gym"},
    {id: 6, time: "19:00", title: "Study group"},
];

const deadlines = [
    {id: 1, name: "OS Shell project", due: "2026-10-02"},
    {id: 2, name: "Linear Algebra pset 4", due: "2026-10-01"},
    {id: 3, name: "Stripe OA", due: "2026-10-09"},
    {id: 4, name: "Algorithms midterm", due: "2026-10-14"},
];

const tasks = [
    {id: 1, name: "Do laundry"},
    {id: 2, name: "Finish OS Shell project"},
];

export default function App() {
    return (
        <Page>
            <Dashboard>
                <WidgetShell area="calendar">
                    <CalendarWidget />
                </WidgetShell>
                <WidgetShell area="job">
                    <JobWidget applications={applications} />
                </WidgetShell>
                <WidgetShell area="goals">
                    <GoalsWidget goals={goals} />
                </WidgetShell>
                <WidgetShell area="timeline">
                    <TimelineWidget events={events} />
                </WidgetShell>
                <WidgetShell area="deadlines">
                    <DeadlinesWidget deadlines={deadlines} />
                </WidgetShell>
                <WidgetShell area="wotd">
                    <WordOfTheDayWidget word="你好" pinyin="nǐ hǎo" definition="hello" />
                </WidgetShell>
                <WidgetShell area="countdown">
                    <CountdownWidget time={42} unit="days" event="Thanksgiving Break" />
                </WidgetShell>
                <WidgetShell area="tasks">
                    <TasksWidget tasks={tasks} />
                </WidgetShell>
                <WidgetShell area="habits">
                    <HabitsWidget habits={habits} />
                </WidgetShell>
            </Dashboard>
            <Dock />
        </Page>
    );
}
