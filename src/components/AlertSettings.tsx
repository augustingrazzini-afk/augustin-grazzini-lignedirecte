import { saveAlerts } from "@/app/actions";
import { ActionForm } from "./client/ActionForm";

/** Réglages des alertes de relance : récap du matin (pour soi) et canal Slack (pour l'espace). */
export function AlertSettings({ digest, slack, clientId, canSlack }: { digest: boolean; slack: string | null; clientId?: string | null; canSlack: boolean }) {
  return (
    <div className="card"><h2>Alertes de relance</h2><p className="sub">Chaque matin de semaine vers 7 h 45 : les relances du jour et celles en retard.</p>
      <ActionForm action={saveAlerts} submit="Enregistrer" hidden={clientId ? { clientId } : undefined}>
        <label className="full row" style={{ flexDirection: "row", alignItems: "center", gap: 10, color: "var(--ink)", fontSize: 14 }}><input type="checkbox" name="digest" defaultChecked={digest} style={{ width: 18, height: 18, accentColor: "var(--blue)" }} />Recevoir le récap par email</label>
        {canSlack && <label className="full">Lien Slack (webhook entrant, facultatif)<input className="input" name="slack" defaultValue={slack || ""} placeholder="https://hooks.slack.com/services/…" />
          <span className="small" style={{ color: "var(--dim)" }}>Slack › Applications › Webhooks entrants › choisir un canal. Le récap y sera aussi publié.</span></label>}
      </ActionForm>
    </div>
  );
}
