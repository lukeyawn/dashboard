function WidgetTitle() {
    return <p className="widget-title">Daily tasks</p>;
}

function MoodTracker() {
    return (
        <div className="mood-tracker">
            <h2>Mood Tracker</h2>
            <p>I'm happy!</p>
        </div>
    );
}

function App() {
    return (
        <div className="dashboard">
            <WidgetTitle />
            <MoodTracker />
        </div>
    );
}

function App() {
    return (
        <>
            <WidgetTitle />
            <MoodTracker />
        </>
    );
}