/**
 * One-time setup: creates unsigned upload preset on Cloudinary.
 * Run: CLOUDINARY_API_KEY=... CLOUDINARY_API_SECRET=... node scripts/setup-cloudinary-preset.mjs
 */
import "dotenv/config";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME ?? "ddyqow8bi";
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;
const presetName = process.env.VITE_CLOUDINARY_UPLOAD_PRESET ?? "whisperlock_unsigned";

if (!apiKey || !apiSecret) {
  console.error("Set CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in .env");
  process.exit(1);
}

const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

const body = {
  name: presetName,
  unsigned: true,
  folder: "whisperlock",
  allowed_formats: "jpg,png,gif,webp,mp4,webm,mov,pdf,doc,docx,zip,txt,mp3,m4a,wav,ogg,webm",
  max_file_size: 52428800,
};

const res = await fetch(
  `https://api.cloudinary.com/v1_1/${cloudName}/upload_presets`,
  {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  },
);

const data = await res.json();
if (res.ok) {
  console.log("Created upload preset:", presetName);
} else if (data.error?.message?.includes("already exists")) {
  console.log("Upload preset already exists:", presetName);
} else {
  console.error("Failed:", data);
  process.exit(1);
}
