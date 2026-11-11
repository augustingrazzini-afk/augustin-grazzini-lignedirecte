// Séparé de ai.ts pour éviter les imports circulaires (ingest ↔ ai).

/** Clé d'API Claude présente (formats « sk-ant-… »). Une clé refusée par l'API bascule en mode essentiel (voir markAiDown). */
const keyLooksValid = () => /^sk-ant-/.test((process.env.ANTHROPIC_API_KEY || "").trim());

let downSince = 0;
/** Clé refusée par l'API (401) : on bascule en mode « sans IA » pendant 10 minutes, puis on réessaie. */
export const markAiDown = () => { downSince = Date.now(); };
const aiDown = () => Date.now() - downSince < 10 * 60e3;

/** L'IA complète (Claude) est utilisable. Sinon : mode « essentiel » sans IA, rien ne casse. */
export const aiEnabled = () => keyLooksValid() && !aiDown();
