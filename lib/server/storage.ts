import "server-only";
import { createClient } from "@supabase/supabase-js";

export const celebrationBucket = "celebration-media";
export const isStorageConfigured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

export function getStorageAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase Storage is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function ensureCelebrationBucket() {
  const admin = getStorageAdmin();
  const { data } = await admin.storage.getBucket(celebrationBucket);
  if (!data) {
    const { error } = await admin.storage.createBucket(celebrationBucket, { public: false, fileSizeLimit: 100 * 1024 * 1024, allowedMimeTypes: ["image/*", "video/*"] });
    if (error && !error.message.toLowerCase().includes("already")) throw error;
  }
  return admin;
}
