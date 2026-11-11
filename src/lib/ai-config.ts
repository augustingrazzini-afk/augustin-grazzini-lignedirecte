// Séparé de ai.ts pour éviter les imports circulaires (ingest ↔ ai).
export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;
