import { LegalPage, V } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata = { title: "Mentions légales" };
export default function Page() {
  const L = LEGAL;
  return (
    <LegalPage title="Mentions légales">
      <p>Conformément aux articles 6-III et 19 de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l&apos;économie numérique (LCEN).</p>
      <h2>Éditeur du site</h2>
      <p>
        Le site {L.site} et le service {L.brand} sont édités par <V v={L.company} />, <V v={L.legalForm} />{L.capital && <> au capital de <V v={L.capital} /></>}.<br />
        SIREN : <V v={L.siren} /> · <V v={L.rcs} /><br />
        TVA : <V v={L.vat} /><br />
        Siège : <V v={L.address} /><br />
        Contact : <V v={L.email} />
      </p>
      <h2>Directeur de la publication</h2>
      <p><V v={L.publisher} /></p>
      <h2>Hébergement</h2>
      <p>{L.host.name}, {L.host.address} ({L.host.site}).<br />Les données de l&apos;application sont stockées dans l&apos;Union européenne (Paris) par Supabase Inc. sur l&apos;infrastructure Amazon Web Services.</p>
      <h2>Propriété intellectuelle</h2>
      <p>La marque {L.brand}, le logo, les textes, les visuels et le logiciel sont protégés. Toute reproduction ou réutilisation sans autorisation écrite est interdite. Les captures d&apos;écran du site utilisent des données de démonstration fictives.</p>
      <h2>Données personnelles et cookies</h2>
      <p>Voir la <a href="/confidentialite">politique de confidentialité et de cookies</a>.</p>
      <h2>Médiation et litiges</h2>
      <p>Le service est réservé aux professionnels. Les litiges relèvent des conditions générales et du droit français.</p>
    </LegalPage>
  );
}
