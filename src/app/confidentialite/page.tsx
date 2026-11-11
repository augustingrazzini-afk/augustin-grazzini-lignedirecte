import { LegalPage, V } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata = { title: "Confidentialité et cookies" };
export default function Page() {
  const L = LEGAL;
  return (
    <LegalPage title="Politique de confidentialité et de cookies">
      <p>Cette politique explique quelles données personnelles {L.brand} traite, pourquoi, combien de temps, et comment exercer vos droits (règlement (UE) 2016/679, « RGPD », et loi Informatique et Libertés).</p>

      <h2>1. Qui est responsable ?</h2>
      <p><b>Pour les données de votre compte</b> (votre email, votre espace, votre abonnement) : <V v={L.company} />, <V v={L.address} />, est responsable de traitement. Contact : <V v={L.email} />.</p>
      <p><b>Pour les données de prospection</b> que vous faites traiter par le service (prospects, appels, transcriptions, emails, messages LinkedIn) : <b>vous êtes responsable de traitement</b> et {L.brand} agit comme sous-traitant, selon l&apos;article 10 des <a href="/cgv">conditions générales</a>. Les prospects qui souhaitent exercer leurs droits doivent s&apos;adresser à l&apos;entreprise qui les a contactés ; nous l&apos;aidons à y répondre.</p>

      <h2>2. Données traitées</h2>
      <ul>
        <li><b>Compte</b> : adresse email, nom de votre espace, rôle, date de connexion.</li>
        <li><b>Abonnement</b> : formule, statut, identifiants Stripe. Les données de carte bancaire sont traitées uniquement par Stripe et ne nous sont jamais transmises.</li>
        <li><b>Outils connectés</b> : clés d&apos;accès à vos outils, conservées chiffrées (AES-256-GCM) et jamais affichées.</li>
        <li><b>Données de prospection</b> : nom, prénom, entreprise, poste, email ou profil LinkedIn des prospects ; date, durée, résultat, résumé, transcription et enregistrement des appels ; événements et réponses des campagnes email et LinkedIn. Les numéros de téléphone ne sont pas conservés (4 derniers chiffres seulement).</li>
        <li><b>Journaux techniques</b> : adresse IP et données de connexion, pour la sécurité et le bon fonctionnement.</li>
      </ul>

      <h2>3. Finalités et bases légales</h2>
      <ul>
        <li>Fournir le service, l&apos;assistance et la facturation : <b>exécution du contrat</b>.</li>
        <li>Sécurité, prévention des abus, journaux techniques : <b>intérêt légitime</b>.</li>
        <li>Obligations comptables et fiscales : <b>obligation légale</b>.</li>
        <li>Emails de service (connexion, récapitulatif des relances, que vous pouvez désactiver) : <b>exécution du contrat</b>.</li>
      </ul>
      <p>Nous n&apos;utilisons pas vos données ni celles de vos prospects pour de la publicité, et nous ne les vendons pas.</p>

      <h2>4. Intelligence artificielle</h2>
      <p>Les transcriptions et réponses sont envoyées à Anthropic (modèles Claude) uniquement pour produire les résumés, objections, relances, briefs et réponses du coach demandés. Selon les conditions commerciales d&apos;Anthropic, ces données ne servent pas à entraîner ses modèles.</p>

      <h2>5. Destinataires et sous-traitants</h2>
      <table>
        <thead><tr><th>Prestataire</th><th>Rôle</th><th>Localisation</th></tr></thead>
        <tbody>{L.processors.map((p) => <tr key={p.name}><td>{p.name}</td><td>{p.role}</td><td>{p.where}</td></tr>)}</tbody>
      </table>
      <p>Les transferts hors de l&apos;Union européenne sont encadrés par les clauses contractuelles types de la Commission européenne et, le cas échéant, le cadre de protection des données UE–États-Unis (Data Privacy Framework).</p>

      <h2>6. Durées de conservation</h2>
      <ul>
        <li>Compte et données de prospection : pendant l&apos;abonnement, puis suppression dans les 30 jours suivant la fin du contrat (délai permettant l&apos;export).</li>
        <li>Liens de connexion : 30 minutes de validité, supprimés au plus tard 24 heures après expiration.</li>
        <li>Session : 30 jours.</li>
        <li>Factures : 10 ans (obligation légale).</li>
        <li>Journaux techniques : 12 mois au plus.</li>
      </ul>

      <h2>7. Sécurité</h2>
      <p>Connexions chiffrées (HTTPS), identifiants des outils chiffrés, cloisonnement strict des données par espace et par client, connexion sans mot de passe par lien à usage unique, base de données hébergée dans l&apos;UE avec un accès dédié à l&apos;application.</p>

      <h2>8. Vos droits</h2>
      <p>Vous disposez des droits d&apos;accès, de rectification, d&apos;effacement, de limitation, d&apos;opposition et de portabilité, ainsi que du droit de définir des directives sur le sort de vos données après votre décès. Écrivez à <V v={L.email} />. Nous répondons sous un mois. Vous pouvez aussi saisir la CNIL (cnil.fr).</p>

      <h2>9. Cookies</h2>
      <p>{L.brand} n&apos;utilise <b>qu&apos;un seul cookie</b> : <code>cockpit_session</code>, qui vous garde connecté (30 jours, sécurisé, inaccessible au JavaScript). Il est strictement nécessaire au service et, à ce titre, dispensé de consentement (article 82 de la loi Informatique et Libertés). Nous n&apos;utilisons aucun cookie de mesure d&apos;audience, de publicité ou de réseau social, et les polices sont hébergées sur nos serveurs : aucun bandeau de consentement n&apos;est donc nécessaire.</p>

      <h2>10. Modifications</h2>
      <p>Cette politique peut évoluer ; la date de mise à jour figure en haut de la page. En cas de changement important, les utilisateurs sont prévenus par email.</p>
    </LegalPage>
  );
}
