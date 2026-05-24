import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { Readable } from "node:stream";
import { initFirebaseAdmin, verifyRoomMember } from "./firebase-admin.js";
import {
  ALLOWED_MIME,
  MAX_BYTES,
  inferMessageType,
  sanitizeFilename,
} from "./validate.js";

const PORT = Number(process.env.UPLOAD_PORT ?? 3001);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES.video, files: 1 },
});

const app = express();
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "whisperlock-upload" });
});

app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing authorization token" });
      return;
    }

    const idToken = authHeader.slice(7);
    const roomCode = String(req.body?.roomCode ?? "").trim().toUpperCase();
    if (!roomCode || roomCode.length < 6) {
      res.status(400).json({ error: "Invalid room code" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const mime = file.mimetype.toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      res.status(415).json({ error: `File type not allowed: ${mime}` });
      return;
    }

    const msgType = inferMessageType(mime);
    const maxSize = MAX_BYTES[msgType];
    if (file.size > maxSize) {
      res.status(413).json({
        error: `File too large. Max ${Math.round(maxSize / 1024 / 1024)}MB for ${msgType}`,
      });
      return;
    }

    const { uid } = await verifyRoomMember(idToken, roomCode);
    const safeName = sanitizeFilename(file.originalname);
    const folder = `whisperlock/${roomCode}`;

    const resourceType =
      msgType === "image" ? "image" : msgType === "video" ? "video" : "raw";

    const result = await new Promise<{
      secure_url: string;
      bytes: number;
      resource_type: string;
      format?: string;
    }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: resourceType,
          public_id: `${uid}_${Date.now()}_${safeName.replace(/\.[^.]+$/, "")}`,
          use_filename: false,
          unique_filename: true,
          overwrite: false,
        },
        (err, uploadResult) => {
          if (err || !uploadResult) reject(err ?? new Error("Upload failed"));
          else resolve(uploadResult);
        },
      );
      Readable.from(file.buffer).pipe(stream);
    });

    console.log("[upload] success", { roomCode, uid, type: msgType, bytes: result.bytes });
    res.json({
      url: result.secure_url,
      fileName: safeName,
      type: msgType,
      bytes: result.bytes,
      mime,
      resourceType: result.resource_type,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    const status =
      message.includes("not a room member") ? 403
      : message.includes("Invalid or expired token") ? 401
      : 500;
    console.error("[upload]", err);
    res.status(status).json({ error: message });
  }
});

async function main() {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.error("Missing Cloudinary env vars. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET");
    process.exit(1);
  }

  await initFirebaseAdmin();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[WhisperLock] Upload server listening on http://0.0.0.0:${PORT}`);
    console.log(`[WhisperLock] Health check: http://localhost:${PORT}/health`);
  });
}

void main();
