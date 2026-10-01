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

export default function App() {
    return (
        <Page>
            <Dashboard>
                <WidgetShell area="calendar">
                    <CalendarWidget />
                </WidgetShell>
                <WidgetShell area="job">
                    <JobWidget />
                </WidgetShell>
                <WidgetShell area="goals">
                    <GoalsWidget />
                </WidgetShell>
                <WidgetShell area="timeline">
                    <TimelineWidget />
                </WidgetShell>
                <WidgetShell area="deadlines">
                    <DeadlinesWidget />
                </WidgetShell>
                <WidgetShell area="wotd">
                    <WordOfTheDayWidget />
                </WidgetShell>
                <WidgetShell area="countdown">
                    <CountdownWidget />
                </WidgetShell>
                <WidgetShell area="tasks">
                    <TasksWidget />
                </WidgetShell>
                <WidgetShell area="habits">
                    <HabitsWidget />
                </WidgetShell>
            </Dashboard>
            <Dock />
        </Page>
    );
}
