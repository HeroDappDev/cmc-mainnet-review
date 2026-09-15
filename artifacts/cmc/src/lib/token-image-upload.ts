const MAX_TOKEN_IMAGE_BYTES = 4 * 1024 * 1024;
const TOKEN_IMAGE_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const TOKEN_IMAGE_PATH_PREFIX = "/api/storage/token-images/";

function hasPngSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function hasJpegSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function hasWebpSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP"
  );
}

async function verifyImageBytes(file: File, contentType: string): Promise<void> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const hasExpectedSignature =
    (contentType === "image/png" && hasPngSignature(bytes)) ||
    (contentType === "image/jpeg" && hasJpegSignature(bytes)) ||
    (contentType === "image/webp" && hasWebpSignature(bytes));

  if (!hasExpectedSignature) {
    throw new Error("The selected file is not a valid PNG, JPEG, or WebP image.");
  }
}

async function verifyImageDecodes(file: File): Promise<void> {
  if (typeof createImageBitmap === "function") {
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file);
      if (bitmap.width <= 0 || bitmap.height <= 0) {
        throw new Error("The selected image has no visible dimensions.");
      }
    } catch {
      throw new Error("The selected file could not be decoded as an image.");
    } finally {
      bitmap?.close();
    }
    return;
  }

  if (typeof Image === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("This browser cannot verify the selected image.");
  }

  const objectURL = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
          reject(new Error("The selected image has no visible dimensions."));
          return;
        }
        resolve();
      };
      image.onerror = () => reject(new Error("Image decoding failed."));
      image.src = objectURL;
    });
  } catch {
    throw new Error("The selected file could not be decoded as an image.");
  } finally {
    URL.revokeObjectURL(objectURL);
  }
}

function getServerError(payload: unknown): string | undefined {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string" &&
    payload.error.length > 0
  ) {
    return payload.error;
  }
  return undefined;
}

/**
 * Validates and uploads a browser-local preview token icon to App Storage.
 *
 * The API generates the object name and returns the only public URL accepted
 * here. This helper never imports images from arbitrary external URLs.
 */
export async function uploadTokenImage(file: File): Promise<string> {
  if (typeof File === "undefined" || !(file instanceof File)) {
    throw new Error("Choose a PNG, JPEG, or WebP image file.");
  }
  if (file.size === 0) {
    throw new Error("Choose a non-empty token image.");
  }
  if (file.size > MAX_TOKEN_IMAGE_BYTES) {
    throw new Error("Token images must be 4 MB or smaller.");
  }

  const contentType = file.type.toLowerCase();
  if (!TOKEN_IMAGE_CONTENT_TYPES.has(contentType)) {
    throw new Error("Token images must be PNG, JPEG, or WebP files.");
  }

  await verifyImageBytes(file, contentType);
  await verifyImageDecodes(file);

  const response = await fetch("/api/storage/token-images", {
    method: "POST",
    headers: {
      "Content-Type": contentType,
    },
    body: file,
  });
  const payload: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    throw new Error(
      getServerError(payload) ??
        "The token image could not be uploaded. Please try again.",
    );
  }

  const imageURL =
    typeof payload === "object" &&
    payload !== null &&
    "imageURL" in payload &&
    typeof payload.imageURL === "string"
      ? payload.imageURL
      : undefined;
  if (!imageURL) {
    throw new Error("The upload response did not include a token image URL.");
  }

  if (typeof window === "undefined") {
    throw new Error("Token image uploads are only available in a browser.");
  }

  let resolvedURL: URL;
  try {
    resolvedURL = new URL(imageURL, window.location.origin);
  } catch {
    throw new Error("The upload response contained an invalid token image URL.");
  }
  if (
    resolvedURL.origin !== window.location.origin ||
    !resolvedURL.pathname.startsWith(TOKEN_IMAGE_PATH_PREFIX) ||
    resolvedURL.search ||
    resolvedURL.hash
  ) {
    throw new Error("The upload response contained an unsafe token image URL.");
  }

  return resolvedURL.toString();
}