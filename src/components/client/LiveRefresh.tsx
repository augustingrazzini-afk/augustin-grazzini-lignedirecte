"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Suivi en direct : la page se met à jour toute seule (toutes les 60 s, et au retour sur l'onglet). */
export function LiveRefresh({ every = 60 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") router.refresh(); };
    const id = setInterval(tick, every * 1000);
    const onVis = () => { if (document.visibilityState === "visible") router.refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [router, every]);
  return null;
}
