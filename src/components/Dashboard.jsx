import { COLUMNS, ROWS } from '../layout';
import './Dashboard.css';

const gridTracks = {
    gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
};

export default function Dashboard({children}) {
    return (
        <div className="dashboard" style={gridTracks}>{children}</div>
    );
}
