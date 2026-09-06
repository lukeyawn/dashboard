export default function CountdownWidget({time, unit = 'days', event}) {
    return (
        <div className="countdown-widget">
            <p className="countdown-number">{time}</p>
            <p className="countdown-label">{unit} until {event}!</p>
        </div>
    );
}