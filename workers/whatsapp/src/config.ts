const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

export const config = {
  databaseUrl: required("DATABASE_URL"),
  authEncryptionKey: required("WHATSAPP_AUTH_ENCRYPTION_KEY"),
  workerId: process.env.WORKER_ID || "mathaka-celebration-wa-v1",
  googleCloudProject: required("GOOGLE_CLOUD_PROJECT"),
  googleCloudLocation: process.env.GOOGLE_CLOUD_LOCATION || "global",
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.6-flash",
  logLevel: process.env.LOG_LEVEL || "info",
  heartbeatMs: Number(process.env.HEARTBEAT_MS || 30_000),
  pollMs: Number(process.env.POLL_MS || 2_000),
};
