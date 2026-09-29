import "server-only";
import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { UserError } from "@/lib/actions";

// S3_* names are used because Vercel reserves the AWS_* variable names.
// AWS_* still works locally as a fallback.
const env = (name: string) => process.env[`S3_${name}`] || process.env[`AWS_${name}`];

let client: S3Client | undefined;

export function isStorageConfigured() {
  return Boolean(env("ACCESS_KEY_ID") && env("SECRET_ACCESS_KEY") && (env("ENDPOINT_URL") || env("ENDPOINT_URL_S3")));
}

function s3() {
  if (!isStorageConfigured()) throw new UserError("File storage is not configured yet (see README → Storage).");
  client ??= new S3Client({
    forcePathStyle: true,
    region: env("REGION") || "auto",
    endpoint: env("ENDPOINT_URL") || env("ENDPOINT_URL_S3"),
    credentials: { accessKeyId: env("ACCESS_KEY_ID")!, secretAccessKey: env("SECRET_ACCESS_KEY")! },
  });
  return client;
}

const bucket = () => process.env.S3_BUCKET || "assets";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
export const PROOF_TYPES = [...IMAGE_TYPES, "application/pdf"];
const MAX_SERVER_UPLOAD = 4 * 1024 * 1024;
const MAX_DIRECT_UPLOAD = 200 * 1024 * 1024;

const extensions: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "application/pdf": "pdf",
};

export function newKey(folder: string, contentType: string) {
  return `${folder}/${randomUUID()}.${extensions[contentType] ?? "bin"}`;
}

/** Upload a small file (logo, payment proof) through the server. */
export async function uploadFile(file: File, folder: string, allowed: string[]) {
  if (!allowed.includes(file.type)) throw new UserError("That file type isn't supported.");
  if (file.size > MAX_SERVER_UPLOAD) throw new UserError("That file is larger than 4 MB.");
  const key = newKey(folder, file.type);
  await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: Buffer.from(await file.arrayBuffer()), ContentType: file.type }));
  return key;
}

/** A short-lived URL the browser can PUT a large file (photos, video) to directly. */
export async function directUploadUrl(folder: string, contentType: string, size: number) {
  if (![...IMAGE_TYPES, ...VIDEO_TYPES].includes(contentType)) throw new UserError("Only photos and videos can be uploaded.");
  if (size > MAX_DIRECT_UPLOAD) throw new UserError("That file is larger than 200 MB.");
  const key = newKey(folder, contentType);
  const url = await getSignedUrl(s3(), new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }), { expiresIn: 600 });
  return { key, url };
}

/** A temporary link to view a private file. */
export async function viewUrl(key: string, expiresIn = 3600) {
  if (!isStorageConfigured()) return null;
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn });
}

export async function deleteFile(key: string) {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
