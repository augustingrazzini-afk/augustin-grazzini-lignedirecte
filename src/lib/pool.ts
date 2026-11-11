/**
 * Exécute `fn` sur chaque élément avec au plus `concurrency` tâches en parallèle.
 * Si `deadline` (timestamp ms) est donné, plus aucune tâche n'est lancée après cette heure :
 * celles déjà commencées vont au bout. Renvoie le nombre d'éléments traités.
 * `fn` peut renvoyer `false` pour arrêter de lancer de nouvelles tâches (ex. limite de débit atteinte).
 */
export async function runPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void | boolean>,
  deadline?: number,
): Promise<number> {
  let next = 0, done = 0, stop = false;
  const worker = async () => {
    while (!stop && next < items.length) {
      if (deadline && Date.now() >= deadline) return;
      const item = items[next++];
      if ((await fn(item)) === false) stop = true;
      done++;
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker));
  return done;
}
