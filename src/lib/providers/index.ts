import { aircall } from "./aircall";
import { custom } from "./custom";
import { hubspot } from "./hubspot";
import { instantly } from "./instantly";
import { lemlist } from "./lemlist";
import { minari } from "./minari";
import { ringover } from "./ringover";
import { skipcall } from "./skipcall";
import { smartlead } from "./smartlead";
import { webhook } from "./webhook";
import { justcall } from "./justcall";
import { dialpad } from "./dialpad";
import { close } from "./close";
import { salesloft } from "./salesloft";
import { apollo } from "./apollo";
import { allo } from "./allo";
import { gong } from "./gong";
import type { Provider } from "./types";

export const PROVIDERS: Record<string, Provider> = { minari, skipcall, lemlist, aircall, ringover, justcall, allo, dialpad, close, salesloft, apollo, gong, instantly, smartlead, hubspot, custom, webhook };
export const providerList = Object.values(PROVIDERS);
export function getProvider(id: string): Provider {
  const p = PROVIDERS[id];
  if (!p) throw new Error(`Source inconnue : ${id}`);
  return p;
}
export const SOURCE_LABEL: Record<string, string> = { minari: "Minari", skipcall: "Skipcall", aircall: "Aircall", ringover: "Ringover", hubspot: "HubSpot", lemlist: "lemlist", justcall: "JustCall", dialpad: "Dialpad", close: "Close", salesloft: "Salesloft", apollo: "Apollo", allo: "Allo", gong: "Gong", instantly: "Instantly", smartlead: "Smartlead", webhook: "Zapier / Make", custom: "Mon outil", csv: "CSV", manual: "Ajout manuel" };
export const CHANNEL_LABEL: Record<string, string> = { call: "Appel", email: "Email", linkedin: "LinkedIn" };
