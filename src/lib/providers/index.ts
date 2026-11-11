import { aircall } from "./aircall";
import { custom } from "./custom";
import { hubspot } from "./hubspot";
import { instantly } from "./instantly";
import { lemlist } from "./lemlist";
import { minari } from "./minari";
import { ringover } from "./ringover";
import { smartlead } from "./smartlead";
import { webhook } from "./webhook";
import type { Provider } from "./types";

export const PROVIDERS: Record<string, Provider> = { minari, aircall, ringover, lemlist, instantly, smartlead, hubspot, custom, webhook };
export const providerList = Object.values(PROVIDERS);
export function getProvider(id: string): Provider {
  const p = PROVIDERS[id];
  if (!p) throw new Error(`Source inconnue : ${id}`);
  return p;
}
export const SOURCE_LABEL: Record<string, string> = { minari: "Minari", aircall: "Aircall", ringover: "Ringover", hubspot: "HubSpot", lemlist: "lemlist", instantly: "Instantly", smartlead: "Smartlead", webhook: "Zapier / Make", custom: "Mon outil", csv: "CSV", manual: "Ajout manuel" };
export const CHANNEL_LABEL: Record<string, string> = { call: "Appel", email: "Email", linkedin: "LinkedIn" };
