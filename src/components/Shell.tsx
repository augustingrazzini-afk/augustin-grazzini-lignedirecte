import { FastLink } from "@/components/client/FastLink";
import Link from "next/link";
import { Suspense } from "react";
import { NavStage } from "./client/NavStage";
import { logout } from "@/app/actions";
import { NavLinks, type NavItem } from "./NavLinks";
import { PERIODS } from "@/lib/period";
import { Logo } from "./Logo";
import { FeedbackLink, HelpWidget } from "./client/HelpWidget";
import { LiveRefresh } from "./client/LiveRefresh";

export type ShellProps = {
  base: string; // "/app" ou "/portal/<id>"
  orgName: string;
  clientName?: string;
  /** Autres espaces de la même personne (commercial suivi par plusieurs entreprises, ou qui a aussi sa propre entreprise). */
  spaces?: { href: string; label: string; current?: boolean }[];
  /** Dernière synchro des outils (« il y a 2 min »), affichée en bas du menu ; null = aucun outil synchronisé. */
  lastSync?: string | null;
  isOrg: boolean;
  email: string;
  followUps?: number;
  banner?: React.ReactNode;
  /** Lien de suivi partagé : lecture seule, pilotage et appels uniquement, pas de compte. */
  share?: boolean;
  /** Espace de l'éditeur : page « Inscriptions » (statistiques de lancement). */
  admin?: boolean;
  /** Widget flottant en bas à droite (assistant IA + avis). */
  /** Pages non incluses dans la formule (cadenas dans le menu), désignées par leur icône. */
  locked?: Record<string, string>;
  widget?: { clientId: string | null; aiReady: boolean; shareToken?: string };
  children: React.ReactNode;
};

export function Shell({ base, orgName, clientName, spaces = [], lastSync, isOrg, email, followUps, banner, share = false, admin = false, locked = {}, widget, children }: ShellProps) {
  // Menu rangé par usage : suivre l'activité, agir, puis l'équipe et les réglages.
  const all: NavItem[] = [
    { href: base, label: "Pilotage", icon: "pilotage", group: "Suivre" },
    { href: `${base}/calls`, label: "Appels", icon: "appels" },
    { href: `${base}/rendez-vous`, label: share || clientName ? "Mes rendez-vous" : "Rendez-vous", icon: "meetings" },
    { href: `${base}/relances`, label: "Relances", icon: "relances", badge: followUps, group: "Agir" },
    { href: `${base}/brief`, label: "Brief pré-meeting", icon: "brief" },
    { href: `${base}/coach`, label: "Assistant IA", icon: "coach" },
    ...(isOrg ? [{ href: `${base}/clients`, label: "Commerciaux", icon: "clients", group: "Équipe et réglages" }] : []),
    { href: `${base}/sources`, label: "Sources", icon: "sources", ...(isOrg ? {} : { group: "Réglages" }) },
    ...(isOrg
      ? [
          { href: `${base}/settings`, label: "Réglages", icon: "settings" },
          { href: `${base}/billing`, label: "Abonnement", icon: "billing" },
          ...(admin ? [{ href: `${base}/inscriptions`, label: "Inscriptions", icon: "clients" }] : []),
        ]
      : []),
  ];
  for (const it of all) if (locked[it.icon]) { it.locked = locked[it.icon]; it.badge = undefined; }
  const anyLocked = Object.keys(locked).length > 0;
  const items = share ? all.filter((it) => [base, `${base}/calls`, `${base}/rendez-vous`, `${base}/coach`].includes(it.href)) : all;
  // Dans le menu latéral, l'abonnement est rangé dans le profil, en bas (il reste dans « Plus » sur téléphone).
  const sideItems = items.filter((it) => it.icon !== "billing");
  const initials = (email.split("@")[0].match(/[a-z0-9]+/gi) || ["?"]).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <div className="theme-light">
      <header className="mtop">
        <Logo size={20} onDark />
      </header>
      <div className="app">
        <aside className="side">
          <Link className="brand" href={base}>
            <div>
              <Logo size={19} />
              <span className="client-tag">{clientName ? <>Espace <b>{clientName}</b></> : <b>{orgName}</b>}</span>
            </div>
          </Link>
          <nav className="nav"><NavLinks items={sideItems} variant="side" />
            {anyLocked && !share && (isOrg ? <Link className="nav-up" href={`${base}/billing#changer`}>Pour aller plus loin : changer de formule →</Link> : <span className="nav-up">Fonctions grisées : non incluses dans la formule de votre entreprise.</span>)}</nav>
          <div className="side-foot">
            {lastSync !== undefined && <span className="side-sync"><i className={lastSync ? "ok" : ""} />{lastSync ? `Synchro ${lastSync}` : "Aucun outil synchronisé"}</span>}
            {share ? <span>Lien de suivi en lecture seule</span> : (
              <details className="me">
                <summary><span className="me-av">{initials}</span><span className="me-id"><b>{email}</b><small>{clientName ? `Suivi par ${orgName}` : orgName}</small></span><span className="me-ch" aria-hidden="true">⌄</span></summary>
                <div className="me-menu">
                  {spaces.length > 1 && <div className="spaces"><small>Vos espaces</small>
                    {spaces.map((sp) => sp.current ? <b key={sp.href}>● {sp.label}</b> : <Link key={sp.href} href={sp.href}>{sp.label}</Link>)}
                  </div>}
                  {isOrg && <Link href={`${base}/billing`}>Abonnement</Link>}
                  {widget && <FeedbackLink />}
                  <form action={logout}><button type="submit">Se déconnecter</button></form>
                </div>
              </details>
            )}
          </div>
        </aside>
        <main className="main">
          {banner}
          <Suspense fallback={children}><NavStage>{children}</NavStage></Suspense>
        </main>
      </div>
      <nav className="tabbar"><NavLinks items={items} variant="tab" footer={!share && <>{spaces.length > 1 && spaces.filter((sp) => !sp.current).map((sp) => <Link key={sp.href} href={sp.href} className="tab-out">Espace {sp.label}</Link>)}<form action={logout} className="tab-out"><button type="submit">Se déconnecter</button></form></>} /></nav>
      <LiveRefresh />
      {widget && <HelpWidget clientId={widget.clientId} isClient={!isOrg} aiReady={widget.aiReady} shareToken={widget.shareToken} />}
    </div>
  );
}

export function PageTop({ title, subtitle, live, children }: { title: string; subtitle?: string; live?: string | null; children?: React.ReactNode }) {
  return (
    <div className="top">
      <div>
        {live && <div className="live"><i />{live}</div>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="controls">{children}</div>}
    </div>
  );
}

export function Period({ days, href, options }: { days: number; href: (d: number) => string; options?: readonly number[] }) {
  const list = PERIODS.filter((p) => !options || options.includes(p.days));
  return (
    <div className="seg" role="group" aria-label="Période">
      {list.map((p) => <FastLink key={p.days} href={href(p.days)} current={p.days === days} eager>{p.label}</FastLink>)}
    </div>
  );
}
