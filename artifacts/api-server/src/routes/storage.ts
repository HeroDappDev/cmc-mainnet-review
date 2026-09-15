import express, {
  Router,
  type IRouter,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { Readable } from "stream";
import { UploadTokenImageResponse } from "@workspace/api-zod";

import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage";

export const TOKEN_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

const TOKEN_IMAGE_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const TOKEN_IMAGE_UPLOAD_WINDOW_MS = 15 * 60 * 1000;
const TOKEN_IMAGE_UPLOADS_PER_WINDOW = 60;
const TOKEN_IMAGE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// This endpoint is deliberately unauthenticated for the browser-local
// preview. Its fixed, server-wide budget is shared by all callers. It does not
// use req.ip or forwarded headers, which avoids both proxy ambiguity and
// spoofable per-user identity. The state is constant-memory.
let sharedUploadWindowStartedAt = Date.now();
let sharedUploadCount = 0;
const objectStorageService = new ObjectStorageService();
const router: IRouter = Router();

function getHeaderValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function detectImageContentType(data: Buffer): string | null {
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[4] === 0x0d &&
    data[5] === 0x0a &&
    data[6] === 0x1a &&
    data[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    data.length >= 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

function takeSharedUploadSlot(): number | null {
  const now = Date.now();
  const windowEndsAt =
    sharedUploadWindowStartedAt + TOKEN_IMAGE_UPLOAD_WINDOW_MS;

  if (now < sharedUploadWindowStartedAt || now >= windowEndsAt) {
    sharedUploadWindowStartedAt = now;
    sharedUploadCount = 0;
  }

  if (sharedUploadCount >= TOKEN_IMAGE_UPLOADS_PER_WINDOW) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil(
        (sharedUploadWindowStartedAt +
          TOKEN_IMAGE_UPLOAD_WINDOW_MS -
          now) /
          1000,
      ),
    );
    return retryAfterSeconds;
  }

  sharedUploadCount += 1;
  return null;
}

function validateTokenImageOrigin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const originHeader = getHeaderValue(req.headers.origin).trim();
  if (!originHeader) {
    // Non-browser clients and same-origin requests that omit Origin remain
    // supported; there is no caller-supplied identity to trust here.
    next();
    return;
  }

  const requestHost = getHeaderValue(req.headers.host).trim().toLowerCase();
  let origin: URL;
  try {
    origin = new URL(originHeader);
  } catch {
    res
      .status(403)
      .json({ error: "Token image uploads require the same origin." });
    return;
  }

  if (
    !requestHost ||
    (origin.protocol !== "http:" && origin.protocol !== "https:") ||
    origin.host.toLowerCase() !== requestHost
  ) {
    res
      .status(403)
      .json({ error: "Token image uploads require the same origin." });
    return;
  }

  next();
}

function readTokenImageBody(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const bodyParser = express.raw({
    type: "*/*",
    limit: TOKEN_IMAGE_MAX_BYTES,
  });

  bodyParser(req, res, (error?: unknown) => {
    if (!error) {
      next();
      return;
    }

    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : 400;
    if (status === 413) {
      res
        .status(413)
        .json({ error: "Token image must be 4 MB or smaller." });
      return;
    }

    res.status(400).json({ error: "Could not read token image upload." });
  });
}

function enforceTokenImageRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const retryAfterSeconds = takeSharedUploadSlot();
  if (retryAfterSeconds !== null) {
    res.setHeader("Retry-After", String(retryAfterSeconds));
    req.log.warn(
      {
        limit: TOKEN_IMAGE_UPLOADS_PER_WINDOW,
        windowMinutes: TOKEN_IMAGE_UPLOAD_WINDOW_MS / 60_000,
      },
      "Shared token image upload budget exhausted",
    );
    res.status(429).json({
      error:
        "The shared token image upload budget is exhausted. Please try again later.",
    });
    return;
  }

  next();
}

function validateTokenImageContentType(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const contentType = getHeaderValue(req.headers["content-type"]).toLowerCase();
  if (!TOKEN_IMAGE_CONTENT_TYPES.has(contentType)) {
    res
      .status(415)
      .json({ error: "Token image must be PNG, JPEG, or WebP." });
    return;
  }

  next();
}

/**
 * POST /storage/token-images
 *
 * Direct server upload for the one public-image use case. The server validates
 * the media type and magic bytes before persisting the bytes in App Storage.
 * No caller-provided object path or external URL is accepted. Because this is
 * an unauthenticated browser-local preview endpoint, all callers share a
 * server-wide 60-upload/15-minute budget.
 */
router.post(
  "/storage/token-images",
  validateTokenImageOrigin,
  enforceTokenImageRateLimit,
  validateTokenImageContentType,
  readTokenImageBody,
  async (req: Request, res: Response) => {
    const contentType = getHeaderValue(req.headers["content-type"]).toLowerCase();
    if (!TOKEN_IMAGE_CONTENT_TYPES.has(contentType)) {
      res
        .status(415)
        .json({ error: "Token image must be PNG, JPEG, or WebP." });
      return;
    }

    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: "Token image upload is empty." });
      return;
    }
    if (body.length > TOKEN_IMAGE_MAX_BYTES) {
      res
        .status(413)
        .json({ error: "Token image must be 4 MB or smaller." });
      return;
    }

    const detectedContentType = detectImageContentType(body);
    if (detectedContentType !== contentType) {
      res.status(400).json({
        error: "The uploaded bytes do not match the declared image type.",
      });
      return;
    }

    try {
      const uploadedImage = await objectStorageService.savePublicTokenImage({
        data: body,
        contentType: detectedContentType,
      });
      res.json(
        UploadTokenImageResponse.parse({
          imageURL: `/api/storage/token-images/${uploadedImage.imageId}`,
        }),
      );
    } catch {
      // Do not expose storage details or signed URLs to unauthenticated callers.
      req.log.error("Failed to save token image");
      res.status(500).json({ error: "Failed to save token image." });
    }
  },
);

/**
 * GET /storage/token-images/:imageId
 *
 * The UUID-only route is deliberately separate from generic object serving.
 * It exposes only images created by the token-image upload endpoint.
 */
router.get(
  "/storage/token-images/:imageId",
  async (req: Request, res: Response) => {
    const rawImageId = req.params.imageId;
    const imageId = Array.isArray(rawImageId) ? rawImageId[0] : rawImageId;
    if (!TOKEN_IMAGE_ID_PATTERN.test(imageId)) {
      res.status(404).json({ error: "Token image not found." });
      return;
    }

    try {
      const objectFile = await objectStorageService.getObjectEntityFile(
        `/objects/token-images/${imageId}`,
      );
      const response = await objectStorageService.downloadObject(
        objectFile,
        31_536_000,
      );

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.setHeader("X-Content-Type-Options", "nosniff");
      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Token image not found." });
        return;
      }

      req.log.error("Failed to serve token image");
      res.status(500).json({ error: "Failed to serve token image." });
    }
  },
);

export default router;