// Lets browsers upload photos/videos straight to the bucket from your site.
// Usage: npm run storage:cors -- https://your-live-site.com
// (localhost:3000 is always allowed for development.)
import { PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

const env = (name) => process.env[`S3_${name}`] || process.env[`AWS_${name}`];
const origins = ["http://localhost:3000", ...process.argv.slice(2).map((origin) => origin.replace(/\/$/, ""))];
const bucket = process.env.S3_BUCKET || "assets";

const s3 = new S3Client({
  forcePathStyle: true,
  region: env("REGION") || "auto",
  endpoint: env("ENDPOINT_URL") || env("ENDPOINT_URL_S3"),
  credentials: { accessKeyId: env("ACCESS_KEY_ID"), secretAccessKey: env("SECRET_ACCESS_KEY") },
  requestChecksumCalculation: "WHEN_REQUIRED",
});

await s3.send(new PutBucketCorsCommand({
  Bucket: bucket,
  CORSConfiguration: {
    CORSRules: [{ AllowedOrigins: origins, AllowedMethods: ["PUT", "GET"], AllowedHeaders: ["Content-Type"], MaxAgeSeconds: 3600 }],
  },
}));
console.log(`CORS set on "${bucket}" for: ${origins.join(", ")}`);
