/** Affiché tout de suite au clic sur un menu ou un bouton, le temps que la page arrive : aucune impression de blocage. */
export default function Loading() {
  return (
    <div className="skel" aria-busy="true" aria-label="Chargement">
      <div className="skel-h" />
      <div className="skel-s" />
      <div className="grid g-kpi" style={{ marginTop: 20 }}>{[0, 1, 2, 3].map((i) => <div key={i} className="card skel-c" />)}</div>
      <div className="card skel-b" style={{ marginTop: 16 }} />
    </div>
  );
}
