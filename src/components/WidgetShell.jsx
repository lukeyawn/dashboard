export default function WidgetShell({children, area}) {
    return (
        <div className="widget-shell" style={{gridArea: area}}>
            {children}
        </div>
    );
}