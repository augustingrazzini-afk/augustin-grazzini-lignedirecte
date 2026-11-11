import Link from "next/link";
import { logout } from "@/app/actions";
import { NavLinks, type NavItem } from "./NavLinks";

export type ShellProps = {
  base: string; // "/app" ou "/portal/<id>"
  orgName: string;
  clientName?: string;
  isOrg: boolean;
  email: string;
  followUps?: number;
  banner?: React.ReactNode;
  children: React.ReactNode;
};

export function Shell({ base, orgName, clientName, isOrg, email, followUps, banner, children }: ShellProps) {
  const items: NavItem[] = [
    { href: base, label: "Pilotage", icon: "pilotage" },
    { href: `${base}/calls`, label: "Appels", icon: "appels" },
    { href: `${base}/emails`, label: "Emails", icon: "email" },
    { href: `${base}/linkedin`, label: "LinkedIn", icon: "linkedin" },
    { href: `${base}/brief`, label: "Brief pré-meeting", icon: "brief" },
    { href: `${base}/relances`, label: "Relances", icon: "relances", badge: followUps },
    { href: `${base}/coach`, label: "Coach IA", icon: "coach" },
    { href: `${base}/sources`, label: "Sources", icon: "sources", sep: true },
    ...(isOrg
      ? [
          { href: `${base}/clients`, label: "Clients", icon: "clients" },
          { href: `${base}/settings`, label: "Réglages", icon: "settings" },
          { href: `${base}/billing`, label: "Abonnement", icon: "billing" },
        ]
      : []),
  ];
  return (
    <>
      <header className="mtop">
        <img src="/logo-mark.png" alt="" />
        <div className="wm" style={{ fontSize: 16 }}><span>Ligne</span><b>Directe</b></div>
      </header>
      <div className="app">
        <aside className="side">
          <Link className="brand" href={base}>
            <img src="/logo-mark.png" alt="LigneDirecte" />
            <div>
              <div className="wm"><span>Ligne</span><b>Directe</b></div>
              <span className="client-tag">{clientName ? <>Espace <b>{clientName}</b></> : <b>{orgName}</b>}</span>
            </div>
          </Link>
          <nav className="nav"><NavLinks items={items} variant="side" /></nav>
          <div className="side-foot">
            <span>{email}</span>
            {clientName && <span>Suivi par <b>{orgName}</b></span>}
            <form action={logout}><button type="submit">Se déconnecter</button></form>
          </div>
        </aside>
        <main className="main">
          {banner}
          {children}
        </main>
      </div>
      <nav className="tabbar"><NavLinks items={items} variant="tab" /></nav>
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

export function Period({ days, href }: { days: number; href: (d: number) => string }) {
  return (
    <div className="seg" role="group" aria-label="Période">
      {[7, 30, 90].map((d) => <Link key={d} href={href(d)} aria-current={d === days ? "true" : undefined} scroll={false}>{d} j</Link>)}
    </div>
  );
}
