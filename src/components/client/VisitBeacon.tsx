"use client";
import { useEffect } from "react";

/** Compte la visite d'une page publique (sans cookie), une seule fois par onglet et par page. */
export function VisitBeacon({ page }: { page: string }) {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(`tp-v:${page}`)) return;
      const first = !sessionStorage.getItem("tp-v");
      sessionStorage.setItem(`tp-v:${page}`, "1");
      sessionStorage.setItem("tp-v", "1");
      const u = new URLSearchParams(location.search).get("utm_source") || "";
      const body = JSON.stringify({ p: page, r: document.referrer, u, first });
      if (!navigator.sendBeacon?.("/api/visit", new Blob([body], { type: "application/json" })))
        fetch("/api/visit", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    } catch { /* mémoire du navigateur indisponible : visite non comptée */ }
  }, [page]);
  return null;
}
