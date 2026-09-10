import './styles.css';
import CountdownWidget from "./components/CountdownWidget";
import TasksWidget from "./components/TasksWidget"
import WidgetShell from './components/WidgetShell';
import Dashboard from './components/Dashboard'
import WOTDWidget from './components/WordOfTheDay';

export default function App() {
    return (
        <Dashboard>
            <WidgetShell area="countdown">
                <CountdownWidget time={42} unit="weeks" event="Thanksgiving Break"/>
            </WidgetShell>
            <WidgetShell area="tasks">
                <TasksWidget tasks={[{id: 1, name: "do laundry"}, {id: 2, name: "Finish OS Shell project"}]}/>
            </WidgetShell> 
            <WidgetShell area="wotd">
                <WOTDWidget word="你好" pinyin="nǐ hǎo" definition="hello"></WOTDWidget>
            </WidgetShell>
            <WidgetShell area="calendar"></WidgetShell>
            <WidgetShell area="job"></WidgetShell>
            <WidgetShell area="goals"></WidgetShell>
            <WidgetShell area="habit"></WidgetShell>
            <WidgetShell area="timeline"></WidgetShell>
            <WidgetShell area="deadlines"></WidgetShell>
        </Dashboard>
    );
}