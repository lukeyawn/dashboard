import './Page.css';

export default function Page({children, onContextMenu}) {
    return (
        <div className="page" onContextMenu={onContextMenu}>
            {children}
        </div>
    );
}
