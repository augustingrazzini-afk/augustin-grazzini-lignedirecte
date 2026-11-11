import { notFound, redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { currentUser, type SessionUser } from "./session";

/**
 * Le périmètre d'une requête. TOUTE lecture/écriture d'appels passe par `callScope()`,
 * ce qui garantit qu'un client ne voit que ses propres appels.
 */
export type Scope =
  | { kind: "org"; orgId: string; userId: string; role: string; clientFilter?: string | null }
  | { kind: "client"; orgId: string; clientId: string; userId: string };

export function callScope(s: Scope): Prisma.CallWhereInput {
  if (s.kind === "client") return { orgId: s.orgId, clientId: s.clientId };
  return s.clientFilter ? { orgId: s.orgId, clientId: s.clientFilter === "none" ? null : s.clientFilter } : { orgId: s.orgId };
}

export function scopeClientId(s: Scope): string | null {
  return s.kind === "client" ? s.clientId : s.clientFilter && s.clientFilter !== "none" ? s.clientFilter : null;
}

export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

/** Espace SDR/agence de l'utilisateur. Un utilisateur sans organisation est envoyé vers son portail ou l'onboarding. */
export async function requireOrgScope(clientFilter?: string | null): Promise<Scope & { kind: "org" }> {
  const u = await requireUser();
  const m = u.memberships[0];
  if (!m) {
    if (u.clientAccess[0]) redirect(`/portal/${u.clientAccess[0].clientId}`);
    redirect("/onboarding");
  }
  if (clientFilter && clientFilter !== "none") {
    // le filtre doit désigner un client de CETTE organisation
    const ok = await import("./db").then(({ db }) => db.client.count({ where: { id: clientFilter as string, orgId: m.orgId } }));
    if (!ok) clientFilter = null;
  }
  return { kind: "org", orgId: m.orgId, userId: u.id, role: m.role, clientFilter: clientFilter || null };
}

/** Portail client : l'utilisateur doit être invité sur CE client, ou membre de l'organisation propriétaire. */
export async function requireClientScope(clientId: string): Promise<Scope & { kind: "client" }> {
  const u = await requireUser();
  const access = u.clientAccess.find((a) => a.clientId === clientId);
  if (access) return { kind: "client", orgId: access.client.orgId, clientId, userId: u.id };
  const { db } = await import("./db");
  const client = await db.client.findUnique({ where: { id: clientId } });
  if (client && u.memberships.some((m) => m.orgId === client.orgId)) return { kind: "client", orgId: client.orgId, clientId, userId: u.id };
  notFound();
}

/** Variante pour les routes API : renvoie null au lieu de rediriger. */
export async function apiScope(req: Request, opts: { clientId?: string | null } = {}): Promise<Scope | null> {
  const u = await currentUser();
  if (!u) return null;
  const clientId = opts.clientId || new URL(req.url).searchParams.get("client");
  if (clientId) {
    const access = u.clientAccess.find((a) => a.clientId === clientId);
    if (access) return { kind: "client", orgId: access.client.orgId, clientId, userId: u.id };
    const { db } = await import("./db");
    const c = await db.client.findUnique({ where: { id: clientId } });
    if (c && u.memberships.some((m) => m.orgId === c.orgId)) return { kind: "client", orgId: c.orgId, clientId, userId: u.id };
    return null;
  }
  const m = u.memberships[0];
  return m ? { kind: "org", orgId: m.orgId, userId: u.id, role: m.role } : null;
}
