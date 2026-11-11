import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const storageEnabled = () => !!(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);
let s3: S3Client | null = null;
const client = () =>
  (s3 ??= new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
    forcePathStyle: !!process.env.S3_ENDPOINT,
  }));

export const MAX_UPLOAD = 200 * 1024 * 1024;
export const ALLOWED_TYPES = ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg", "video/mp4", "video/webm", "video/quicktime"];

/** URL d'envoi directe (le fichier ne transite pas par notre serveur). La clé est préfixée par l'organisation. */
export async function presignUpload(orgId: string, contentType: string, size: number) {
  if (!storageEnabled()) throw new Error("Le stockage des enregistrements n'est pas configuré.");
  if (!ALLOWED_TYPES.includes(contentType)) throw new Error("Format non pris en charge.");
  if (size > MAX_UPLOAD) throw new Error("Fichier trop lourd (200 Mo maximum).");
  const key = `${orgId}/${Date.now().toString(36)}-${crypto.randomUUID()}`;
  const url = await getSignedUrl(client(), new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, ContentType: contentType, ContentLength: size }), { expiresIn: 900 });
  return { key, url };
}

/** Lien de lecture temporaire (1 h), généré seulement pour quelqu'un qui a accès à l'appel. */
export async function presignRead(key: string) {
  if (!storageEnabled()) return null;
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }), { expiresIn: 3600 });
}
