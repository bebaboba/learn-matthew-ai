const PERSONAS = [
  {
    id: 'recruiter',
    label: 'Recruiter',
    description: "You're evaluating Matthew for a role or your pipeline.",
  },
  {
    id: 'hiring_manager',
    label: 'Hiring Manager',
    description: "You want to understand his work, how he thinks, and how he'd operate.",
  },
  {
    id: 'curious_stranger',
    label: 'Curious Stranger',
    description: "No agenda. You just want to see what this is.",
  },
];

export default function PersonaPicker({ onSelect }) {
  return (
    <div className="picker-wrapper">
      <div className="picker-inner">
        <p className="picker-eyebrow">Portfolio</p>
        <h1 className="picker-heading">Who's asking?</h1>
        <p className="picker-sub">Pick the lens that fits. The experience adapts to you.</p>
        <div className="persona-grid">
          {PERSONAS.map((p) => (
            <button key={p.id} className="persona-card" onClick={() => onSelect(p.id)}>
              <span className="persona-label">{p.label}</span>
              <span className="persona-desc">{p.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
