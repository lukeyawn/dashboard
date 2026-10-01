import './NightOverlay.css';

// The black screen at night (DESIGN §6.4). The first tap only dismisses it, so a
// tap in the dark can't tick a task by accident: it's handled on click, once
// the whole tap is over, and the touch never reaches the page underneath.
export default function NightOverlay({ onDismiss }) {
    return (
        <div
            className="night-overlay"
            data-ignore-idle
            aria-hidden="true"
            onPointerDown={event => event.stopPropagation()}
            onClick={event => {
                event.stopPropagation();
                onDismiss();
            }}
        />
    );
}
