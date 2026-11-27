import { LegalPage, V } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";
import { PLANS, euros } from "@/lib/billing";

export const metadata = { title: "Conditions générales" };
export default function Page() {
  const L = LEGAL;
  return (
    <LegalPage title="Conditions générales de vente et d'utilisation">
      <h2>1. Objet</h2>
      <p>Les présentes conditions régissent l&apos;accès et l&apos;utilisation du service {L.brand} (le « Service »), édité par <V v={L.company} /> (l&apos;« Éditeur »). Le Service permet à une entreprise de centraliser les appels de prospection de ses commerciaux (salariés, freelances ou agences), issus des outils d&apos;appel qu&apos;ils connectent, et de les analyser.</p>
      <h2>2. Clients concernés</h2>
      <p>Le Service est réservé aux professionnels (entreprises et leurs commerciaux, salariés ou prestataires) agissant dans le cadre de leur activité. Le droit de rétractation du Code de la consommation ne s&apos;applique pas.</p>
      <h2>3. Compte et accès</h2>
      <p>La connexion se fait par lien envoyé par email. L&apos;utilisateur est responsable de l&apos;accès à sa boîte email et des personnes qu&apos;il invite (dirigeants, managers, commerciaux). Le lien de suivi partagé avec un client donne accès, sans compte, aux données de ce client : l&apos;utilisateur choisit de le créer, le partage sous sa responsabilité et peut le désactiver à tout moment.</p>
      <h2>4. Souscription</h2>
      <p>L&apos;accès à Trustpipe démarre avec la souscription d&apos;une formule : la carte bancaire, enregistrée sur Stripe, est débitée du premier mois à la souscription. Les espaces ouverts avant le 27 novembre 2026 avec un essai gratuit le conservent jusqu&apos;à son terme.</p>
      <h2>5. Prix et paiement</h2>
      <p>Formules, par mois et par commercial suivi (salarié, freelance ou agence) : {PLANS.starter.name} à {euros(PLANS.starter.price)} € HT (sans fonctions d&apos;intelligence artificielle), {PLANS.agency.name} à {euros(PLANS.agency.price)} € HT et {PLANS.premium.name} à {euros(PLANS.premium.price)} € HT (avec l&apos;assistant IA, les briefs et débriefs de rendez-vous, la transcription automatique et le connecteur Claude). Le nombre de commerciaux est choisi à la souscription et modifiable ensuite ; les membres de l&apos;entreprise qui consultent l&apos;espace (dirigeants, managers) ne sont pas facturés. Les abonnements souscrits avant le 27 novembre 2026 à une autre formule la conservent. Les prix applicables sont ceux affichés au moment de la souscription. Le paiement est mensuel, par carte, via Stripe ; l&apos;abonnement se renouvelle tacitement chaque mois. En cas d&apos;échec de paiement, l&apos;accès peut être suspendu après relance. Toute modification de prix est annoncée au moins 30 jours à l&apos;avance et s&apos;applique au renouvellement suivant.</p>
      <h2>6. Résiliation</h2>
      <p>L&apos;utilisateur résilie à tout moment depuis la page Abonnement ; la résiliation prend effet à la fin de la période payée, sans remboursement de la période en cours. L&apos;Éditeur peut suspendre ou résilier un compte en cas de manquement grave aux présentes conditions.</p>
      <h2>7. Outils connectés et données importées</h2>
      <p>L&apos;utilisateur connecte ses propres outils (Minari, lemlist, Skipcall, Aircall, Ringover, JustCall, Allo, Dialpad, Close, Salesloft, Apollo, Gong, HubSpot, Zapier, Make, n8n…) avec ses identifiants, qui sont chiffrés. Il garantit disposer des droits nécessaires sur ces outils et sur les données qu&apos;ils contiennent, et respecter leurs conditions d&apos;utilisation. L&apos;Éditeur n&apos;est pas responsable de l&apos;indisponibilité ou des changements de ces outils tiers.</p>
      <h2>8. Intelligence artificielle</h2>
      <p>Les résumés, objections, relances, briefs et réponses du coach sont produits automatiquement et peuvent contenir des erreurs. Ils constituent une aide à la décision et doivent être vérifiés par l&apos;utilisateur.</p>
      <h2>9. Disponibilité et responsabilité</h2>
      <p>L&apos;Éditeur met en œuvre les moyens raisonnables pour assurer la disponibilité et la sécurité du Service (obligation de moyens). Sa responsabilité est limitée aux dommages directs et plafonnée aux sommes payées par l&apos;utilisateur au cours des 12 derniers mois. Les pertes indirectes (chiffre d&apos;affaires, clientèle, données) sont exclues.</p>
      <h2>10. Données personnelles : sous-traitance (article 28 du RGPD)</h2>
      <p>Pour les données de prospection (prospects, appels, enregistrements, transcriptions) que l&apos;utilisateur fait traiter par le Service, l&apos;utilisateur est <b>responsable de traitement</b> et l&apos;Éditeur <b>sous-traitant</b>. À ce titre, l&apos;Éditeur :</p>
      <ul>
        <li>ne traite ces données que sur instruction de l&apos;utilisateur, pour fournir le Service ;</li>
        <li>veille à la confidentialité des personnes autorisées à y accéder ;</li>
        <li>met en œuvre des mesures de sécurité adaptées : chiffrement des identifiants des outils, cloisonnement des données par espace et par client, accès sécurisé, numéros de téléphone non conservés (4 derniers chiffres seulement) ;</li>
        <li>recourt aux sous-traitants listés dans la <a href="/confidentialite">politique de confidentialité</a>, encadrés par des clauses contractuelles types pour les transferts hors UE, et informe l&apos;utilisateur de tout changement ;</li>
        <li>aide l&apos;utilisateur à répondre aux demandes d&apos;exercice de droits et notifie toute violation de données dans les meilleurs délais ;</li>
        <li>supprime les données à la fin du contrat, après un délai de 30 jours permettant l&apos;export, sauf obligation légale de conservation ;</li>
        <li>met à disposition les informations nécessaires pour démontrer le respect de ces obligations.</li>
      </ul>
      <p>L&apos;utilisateur reste responsable de la licéité de sa prospection (base légale, information des prospects, droit d&apos;opposition, règles de démarchage B2B).</p>
      <h2>11. Modification des conditions</h2>
      <p>Les conditions peuvent évoluer ; l&apos;utilisateur est informé au moins 30 jours avant l&apos;entrée en vigueur d&apos;une modification importante et peut résilier s&apos;il la refuse.</p>
      <h2>12. Droit applicable</h2>
      <p>Les présentes conditions sont soumises au droit français. À défaut d&apos;accord amiable, tout litige relève des tribunaux compétents du ressort du siège de l&apos;Éditeur.</p>
      <h2>Contact</h2>
      <p><V v={L.email} /></p>
    </LegalPage>
  );
}
