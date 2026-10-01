import './TimelineWidget.css';

function toMinutes(time) {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

function formatTime(time) {
    const [h, m] = time.split(':').map(Number);
    return new Date(0, 0, 0, h, m).toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'});
}

// events: {id: number, time: string ("HH:MM", 24-hour), title: string}[], sorted by time
export default function TimelineWidget({events = []}) {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    // the current event is the last one that has already started
    const currentIndex = events.findLastIndex(e => toMinutes(e.time) <= nowMinutes);

    return (
        <div className="widget timeline-widget">
            <p className="widget-title">Today</p>
            <ol className="timeline">
                {events.map((e, i) => {
                    const status = i < currentIndex ? 'past' : i === currentIndex ? 'current' : 'upcoming';
                    return (
                        <li key={e.id} className={`timeline-event ${status}`}>
                            <span className="timeline-time">{formatTime(e.time)}</span>
                            <span className="timeline-title">{e.title}</span>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
