import Link from "next/link";
import { logout } from "@/app/actions";
import { NavLinks, type NavItem } from "./NavLinks";
import { PERIODS } from "@/lib/period";
import { Logo } from "./Logo";
import { FeedbackLink, HelpWidget } from "./client/HelpWidget";

export type ShellProps = {
  base: string; // "/app" ou "/portal/<id>"
  orgName: string;
  clientName?: string;
  isOrg: boolean;
  email: string;
  followUps?: number;
  banner?: React.ReactNode;
  /** Lien de suivi partagé : lecture seule, pilotage et appels uniquement, pas de compte. */
  share?: boolean;
  /** Widget flottant en bas à droite (assistant IA + avis). */
  widget?: { clientId: string | null; aiReady: boolean; shareToken?: string };
  children: React.ReactNode;
};

export function Shell({ base, orgName, clientName, isOrg, email, followUps, banner, share = false, widget, children }: ShellProps) {
  const all: NavItem[] = [
    { href: base, label: "Pilotage", icon: "pilotage" },
    { href: `${base}/calls`, label: "Appels", icon: "appels" },
    { href: `${base}/brief`, label: "Brief pré-meeting", icon: "brief" },
    { href: `${base}/relances`, label: "Relances", icon: "relances", badge: followUps },
    { href: `${base}/coach`, label: "Assistant IA", icon: "coach" },
    { href: `${base}/sources`, label: "Sources", icon: "sources", sep: true },
    ...(isOrg
      ? [
          { href: `${base}/clients`, label: "Clients", icon: "clients" },
          { href: `${base}/settings`, label: "Réglages", icon: "settings" },
          { href: `${base}/billing`, label: "Abonnement", icon: "billing" },
        ]
      : []),
  ];
  const items = share ? all.filter((it) => [base, `${base}/calls`, `${base}/coach`].includes(it.href)) : all;
  return (
    <>
      <header className="mtop">
        <Logo size={20} onDark />
      </header>
      <div className="app">
        <aside className="side">
          <Link className="brand" href={base}>
            <div>
              <Logo size={28} onDark />
              <span className="client-tag">{clientName ? <>Espace <b>{clientName}</b></> : <b>{orgName}</b>}</span>
            </div>
          </Link>
          <nav className="nav"><NavLinks items={items} variant="side" /></nav>
          <div className="side-foot">
            {share && <span>Lien de suivi en lecture seule</span>}
            {clientName && <span>Suivi par <b>{orgName}</b></span>}
            {widget && !share && <FeedbackLink />}
            {!share && <form action={logout}><button type="submit">Se déconnecter</button></form>}
          </div>
        </aside>
        <main className="main">
          {banner}
          {children}
        </main>
      </div>
      <nav className="tabbar"><NavLinks items={items} variant="tab" /></nav>
      {widget && <HelpWidget clientId={widget.clientId} isClient={!isOrg} aiReady={widget.aiReady} shareToken={widget.shareToken} />}
    </>
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
      {list.map((p) => <Link key={p.days} href={href(p.days)} aria-current={p.days === days ? "true" : undefined} scroll={false}>{p.label}</Link>)}
    </div>
  );
}
