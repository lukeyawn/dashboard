import { placement } from '../layout';
import './WidgetShell.css';

// Places a widget on the grid; the widget itself knows nothing about the grid (DESIGN §7)
export default function WidgetShell({children, area}) {
    const { gridColumn, gridRow, cols, rows } = placement(area);
    return (
        <div className="widget-shell" data-area={area} style={{gridColumn, gridRow, '--cols': cols, '--rows': rows}}>
            {children}
        </div>
    );
}
