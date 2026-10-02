import { useState } from 'react';
import NightOverlay from './components/NightOverlay';
import Page from './components/Page';
import { IDLE_MS } from './config';
import { useIdle } from './hooks/useIdle';
import { useIsKiosk, useReloadRules } from './hooks/useKiosk';
import { useResource } from './hooks/useResource';
import { request } from './lib/api';
import Dashboard from './components/Dashboard';
import WidgetShell from './components/WidgetShell';
import Dock from './components/Dock';
import AssignmentsWidget from './widgets/assignments/AssignmentsWidget';
import CountdownWidget from './widgets/countdown/CountdownWidget';
import GoalsWidget from './widgets/goals/GoalsWidget';
import HabitsWidget from './widgets/habits/HabitsWidget';
import JobWidget from './widgets/job/JobWidget';
import TasksWidget from './widgets/tasks/TasksWidget';
import TimelineWidget from './widgets/timeline/TimelineWidget';
import UpcomingWidget from './widgets/upcoming/UpcomingWidget';
import WordOfTheDayWidget from './widgets/wotd/WordOfTheDayWidget';

export default function App() {
    const isKiosk = useIsKiosk();
    const { idle, wake } = useIdle(IDLE_MS);
    const night = useResource('night', { pollMs: 60_000 });
    // the moon button darkens the screen at once, without waiting for idle
    const [darkNow, setDarkNow] = useState(false);
    useReloadRules({ enabled: isKiosk, idle });

    // night mode darkens only the kiosk; other screens can still start or cancel it
    const dark = isKiosk && Boolean(night.data?.active) && (idle || darkNow);

    async function toggleNight() {
        const early = night.data?.early;
        await request(early ? '/night/cancel' : '/night/start', { method: 'POST' }).catch(() => {});
        await night.refresh();
        setDarkNow(!early);
    }

    return (
        // long-press menus are suppressed on the kiosk (DESIGN §6.1)
        <Page onContextMenu={event => event.preventDefault()}>
            <Dashboard>
                <WidgetShell area="upcoming">
                    <UpcomingWidget />
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
                <WidgetShell area="assignments">
                    <AssignmentsWidget />
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
            <Dock night={night.data} onMoon={toggleNight} />
            {dark && <NightOverlay onDismiss={() => { setDarkNow(false); wake(); }} />}
        </Page>
    );
}
