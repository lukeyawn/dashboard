import './styles.css';
import CountdownWidget from "./components/CountdownWidget";
import TasksWidget from "./components/TasksWidget"
import WidgetShell from './components/WidgetShell';
import Dashboard from './components/Dashboard'

export default function App() {
    return (
        <Dashboard>
            <WidgetShell area="countdown">
                <CountdownWidget time={42} unit="weeks" event="Thanksgiving Break"/>
            </WidgetShell>
            <WidgetShell area="tasks">
                <TasksWidget tasks={[{id: 1, name: "do laundry"}, {id: 2, name: "Finish OS Shell project"}]}/>
            </WidgetShell> 
            <WidgetShell area="wotd"></WidgetShell>
            <WidgetShell area="calendar"></WidgetShell>
            <WidgetShell area="job"></WidgetShell>
            <WidgetShell area="goals"></WidgetShell>
            <WidgetShell area="heatmap"></WidgetShell>
            <WidgetShell area="habit-entry"></WidgetShell>
            <WidgetShell area="timeline"></WidgetShell>
            <WidgetShell area="birthdays"></WidgetShell>
            <WidgetShell area="UNASSIGNED"></WidgetShell>
            <WidgetShell area="deadlines"></WidgetShell>
        </Dashboard>
    );
}