import './styles.css';
import CountdownWidget from "./components/CountdownWidget";
import WidgetShell from './components/WidgetShell';

export default function App() {
    return (
        <div className="dashboard">
            <WidgetShell>
                <CountdownWidget time={42} unit="weeks" event="Thanksgiving Break"/>
            </WidgetShell>
        </div>
    );
}