import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

const N = 16384, R = 8, P = 1, LEN = 64, MAXMEM = 64 * 1024 * 1024;

function scrypt(pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCb(pw.normalize("NFKC"), salt, len, { ...opts, maxmem: MAXMEM }, (err, key) => (err ? reject(err) : resolve(key))));
}

/** Hachage scrypt avec sel aléatoire, format « scrypt$N$r$p$sel$hash » (base64url). */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, LEN, { N, r: R, p: P });
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(pw: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [algo, n, r, p, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const key = await scrypt(pw, Buffer.from(salt, "base64url"), expected.length, { N: +n, r: +r, p: +p });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Règle simple et lisible : au moins 10 caractères, pas uniquement des chiffres, pas l'identifiant de l'email. */
export function passwordProblem(pw: string, email = ""): string | null {
  if (pw.length < 10) return "Le mot de passe doit faire au moins 10 caractères.";
  if (pw.length > 200) return "Mot de passe trop long.";
  if (/^\d+$/.test(pw)) return "Le mot de passe ne doit pas contenir que des chiffres.";
  const local = email.split("@")[0].toLowerCase();
  if (local.length >= 4 && pw.toLowerCase().includes(local)) return "Le mot de passe ne doit pas contenir votre email.";
  return null;
}
