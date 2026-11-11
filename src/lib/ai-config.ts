// Séparé de ai.ts pour éviter les imports circulaires (ingest ↔ ai).

/** Une vraie clé d'API Claude commence par « sk-ant-api » (les jetons de compte « sk-ant-oat/usr » ne marchent pas). */
const keyLooksValid = () => /^sk-ant-api/.test((process.env.ANTHROPIC_API_KEY || "").trim());

let downSince = 0;
/** Clé refusée par l'API (401) : on bascule en mode « sans IA » pendant 10 minutes, puis on réessaie. */
export const markAiDown = () => { downSince = Date.now(); };
const aiDown = () => Date.now() - downSince < 10 * 60e3;

/** L'IA complète (Claude) est utilisable. Sinon : mode « essentiel » sans IA, rien ne casse. */
export const aiEnabled = () => keyLooksValid() && !aiDown();
