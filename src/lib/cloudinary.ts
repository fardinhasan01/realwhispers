/**
 * Public Cloudinary config only — API secret never belongs in the client.
 * Create an unsigned upload preset in Cloudinary Console:
 * Settings → Upload → Upload presets → Add → Signing Mode: Unsigned
 * Name must match VITE_CLOUDINARY_UPLOAD_PRESET (e.g. whisperlock_unsigned)
 */
export type CloudinaryResourceType = "image" | "video" | "raw" | "auto";

export function getCloudinaryConfig(): {
  cloudName: string;
  uploadPreset: string;
} {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined;
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined;

  if (!cloudName || !uploadPreset) {
    throw new Error(
      "Cloudinary not configured. Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET in .env",
    );
  }

  return { cloudName, uploadPreset };
}

export function getCloudinaryUploadUrl(
  resourceType: CloudinaryResourceType = "auto",
): string {
  const { cloudName } = getCloudinaryConfig();
  const type = resourceType === "auto" ? "auto" : resourceType;
  return `https://api.cloudinary.com/v1_1/${cloudName}/${type}/upload`;
}

/** Video poster frame from Cloudinary URL */
export function cloudinaryVideoPoster(url: string): string {
  if (!url.includes("res.cloudinary.com") || !url.includes("/video/upload/")) {
    return url;
  }
  const parts = url.split("/video/upload/");
  if (parts.length !== 2) return url;
  return `${parts[0]}/video/upload/so_0,w_400,h_300,c_fill/${parts[1].replace(/\.[^/.]+$/, ".jpg")}`;
}
