export function SystemsStrip() {
  const systems = [
    { name: 'Member', event: 'PhotosSubmitted', api: '/ (local)' },
    { name: 'Permits', event: 'PermitCheckCompleted', api: '/api/permits/*' },
    { name: 'Field', event: 'WorkOrderClosed', api: '/api/field/*' },
    { name: 'Activation', event: 'RegistrationFailed', api: '/api/activation/*' },
    { name: 'Base Admin', event: 'process_manager', api: '/api/ops/*' },
  ];

  return (
    <section className="console-systems-strip" aria-label="Integration architecture">
      <div className="console-systems-heading">
        <p className="console-eyebrow"><span /> INTEGRATION PATTERN</p>
        <h2>Event-driven services</h2>
        <p>Each system owns its API path and emits events. Base Admin joins them into one install graph.</p>
      </div>
      <div className="console-systems-grid">
        {systems.map((s) => (
          <div key={s.name} className="console-systems-card">
            <strong>{s.name}</strong>
            <span className="console-systems-event">{s.event}</span>
            <code>{s.api}</code>
          </div>
        ))}
      </div>
    </section>
  );
}
