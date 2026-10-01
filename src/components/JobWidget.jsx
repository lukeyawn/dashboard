const STAGES = ['applied', 'interview', 'offer', 'rejected'];

// applications: {id: number, company: string, role: string, status: 'applied' | 'interview' | 'offer' | 'rejected'}[], newest first
export default function JobWidget({applications = []}) {
    return (
        <div className="widget job-widget">
            <p className="widget-title">Job search</p>
            <div className="job-stages">
                {STAGES.map(stage => (
                    <div key={stage} className={`job-stage ${stage}`}>
                        <div className="job-stage-count">{applications.filter(a => a.status === stage).length}</div>
                        <div className="job-stage-label">{stage}</div>
                    </div>
                ))}
            </div>
            <ul className="job-list">
                {applications.slice(0, 3).map(a => (
                    <li key={a.id}>
                        <span className="job-company">{a.company}</span>
                        <span className="job-role">{a.role}</span>
                        <span className={`status-pill ${a.status}`}>{a.status}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
