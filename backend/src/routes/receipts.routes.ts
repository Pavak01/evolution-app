import { Router, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../auth/tokens.js";
import { db } from "../db.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { sendError } from "../middleware/errorHandler.js";
import { getReceiptPresignedUrl } from "../receiptStorage.js";

export const receiptsRouter = Router();

// Two-layer signed download: a 15-min purpose-scoped app JWT (minted by
// getReceiptDownloadUrl and embedded wherever an expense is returned),
// verified here, ownership re-checked against the DB, then exchanged for a
// 300s S3 presigned URL. Neither layer alone is a durable public link.
receiptsRouter.get("/receipts/:receiptId/download", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const receiptId = req.params.receiptId;
  const token = String(req.query.token ?? "");

  if (!token) {
    return res.status(401).json({ error: "Download token is required" });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (typeof decoded !== "object" || decoded === null) {
      return res.status(401).json({ error: "Invalid download token" });
    }

    const payload = decoded as jwt.JwtPayload;
    if (payload.purpose !== "receipt-download" || payload.sub !== authReq.userId || payload.rid !== receiptId) {
      return res.status(401).json({ error: "Invalid download token" });
    }
  } catch {
    return res.status(401).json({ error: "Invalid or expired download token" });
  }

  try {
    const result = await db.query<{ original_filename: string; storage_path: string }>(
      "SELECT original_filename, storage_path FROM receipts WHERE id = $1 AND user_id = $2 LIMIT 1",
      [receiptId, authReq.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Receipt not found" });
    }

    const receipt = result.rows[0];
    const presignedUrl = await getReceiptPresignedUrl(receipt.storage_path, receipt.original_filename);
    return res.redirect(302, presignedUrl);
  } catch (error) {
    return sendError(res, 500, "Failed to load receipt", error);
  }
});
