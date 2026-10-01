export default function Dock({time, date, weather}) {
    return (
        <div className="dock">
            <div className="dock-date-and-time">
                <div className="dock-date">{date}</div>
                <div className="dock-time">{time}</div>
            </div>
            <div className="dock-weather">{weather}</div>
        </div>
    );
};