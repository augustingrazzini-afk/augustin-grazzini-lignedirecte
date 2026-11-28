"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const KEY = "tp_cookies_ok";

/**
 * Bandeau d'information sur les cookies, à l'arrivée sur le site public.
 * Trustpipe ne dépose qu'un cookie de connexion (strictement nécessaire) : il n'y a donc rien à accepter ou refuser,
 * le bandeau informe et se ferme. Le choix est gardé dans le navigateur (pas dans un cookie).
 */
export function CookieNotice() {
  const path = usePathname();
  const [show, setShow] = useState(false);
  useEffect(() => { try { setShow(!localStorage.getItem(KEY)); } catch { setShow(true); } }, []);
  // Pas dans l'appli : la personne est connectée et a déjà vu l'information.
  if (!show || /^\/(app|portal|suivi|oauth)(\/|$)/.test(path)) return null;
  const close = () => { try { localStorage.setItem(KEY, "1"); } catch { /* navigation privée */ } setShow(false); };
  return (
    <div className="ck" role="region" aria-label="Information sur les cookies">
      <p><b>Cookies.</b> Trustpipe n&apos;utilise qu&apos;un cookie de connexion, indispensable au fonctionnement du site. Aucune publicité, aucun traceur. <Link href="/confidentialite">En savoir plus</Link></p>
      <button type="button" className="ck-btn" onClick={close}>J&apos;ai compris</button>
    </div>
  );
}
