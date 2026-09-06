import './styles.css';
import CountdownWidget from "./components/CountdownWidget";

export default function App() {
    return (
        <div className="dashboard">
            <CountdownWidget time={42} unit="weeks" event="Thanksgiving Break"/>
        </div>
    );
}