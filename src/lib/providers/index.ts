import { aircall } from "./aircall";
import { hubspot } from "./hubspot";
import { lemlist } from "./lemlist";
import { minari } from "./minari";
import { ringover } from "./ringover";
import type { Provider } from "./types";

export const PROVIDERS: Record<string, Provider> = { minari, aircall, ringover, hubspot, lemlist };
export const providerList = Object.values(PROVIDERS);
export function getProvider(id: string): Provider {
  const p = PROVIDERS[id];
  if (!p) throw new Error(`Source inconnue : ${id}`);
  return p;
}
export const SOURCE_LABEL: Record<string, string> = { minari: "Minari", aircall: "Aircall", ringover: "Ringover", hubspot: "HubSpot", lemlist: "lemlist", csv: "CSV", manual: "Ajout manuel" };
