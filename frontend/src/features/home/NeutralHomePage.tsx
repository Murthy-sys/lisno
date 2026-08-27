export function NeutralHomePage({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="role-landing" aria-labelledby="neutral-home-title">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1 id="neutral-home-title" tabIndex={-1}>{title}</h1>
          <p>{description}</p>
        </div>
      </header>
    </section>
  );
}
