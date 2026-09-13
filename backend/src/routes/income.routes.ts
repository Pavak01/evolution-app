import { Router, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { getInvoiceDownloadUrl, getJwtSecret } from "../auth/tokens.js";
import { db } from "../db.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { sendError } from "../middleware/errorHandler.js";
import { uploadRateLimit } from "../middleware/rateLimit.js";
import { upload } from "../middleware/upload.js";
import { deleteReceiptObject, getReceiptPresignedUrl, receiptContentMatchesDeclaredType, uploadReceiptObject } from "../receiptStorage.js";
import { getTaxYearFromDate } from "../rulesEngine.js";
import { recomputeTaxSummary } from "../taxSummary.js";
import { voidSchema } from "../validation/expenses.schema.js";
import { incomeInvoiceListQuerySchema, incomeInvoiceWriteSchema } from "../validation/incomeInvoices.schema.js";

export const incomeRouter = Router();

type InvoiceRow = {
  id: string;
  period_start: string;
  period_end: string;
  source: string;
  total_amount: string;
  received_date: string;
  tax_year: string;
  invoice_storage_path: string | null;
  invoice_original_filename: string | null;
  notes: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
};

function serializeInvoice(req: Request, authReq: AuthenticatedRequest, row: InvoiceRow) {
  return {
    id: row.id,
    period_start: row.period_start,
    period_end: row.period_end,
    source: row.source,
    total_amount: Number(row.total_amount),
    received_date: row.received_date,
    tax_year: row.tax_year,
    notes: row.notes,
    voided_at: row.voided_at,
    void_reason: row.void_reason,
    created_at: row.created_at,
    file_download_url: row.invoice_storage_path ? getInvoiceDownloadUrl(req, authReq.userId, row.id) : null
  };
}

const invoiceColumns = `id, period_start::text, period_end::text, source, total_amount::text, received_date::text,
  tax_year, invoice_storage_path, invoice_original_filename, notes, voided_at::text, void_reason, created_at::text`;

// File is optional here, unlike expense capture — an invoice can be logged
// from the total alone, with the file attached later isn't supported in v1
// (this endpoint is a single create, matching the "log it when it arrives" action).
incomeRouter.post(
  "/income-invoices",
  requireAuth,
  uploadRateLimit,
  upload.single("invoice_file"),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const parsed = incomeInvoiceWriteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    }

    const file = req.file;
    if (file && !receiptContentMatchesDeclaredType(file.buffer, file.mimetype)) {
      return res.status(400).json({ error: "File content does not match its declared type" });
    }

    const data = parsed.data;
    const taxYear = getTaxYearFromDate(data.received_date);

    let storageKey: string | null = null;
    if (file) {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      storageKey = `invoices/${authReq.userId}/${uuidv4()}-${safeName}`;
      try {
        await uploadReceiptObject(storageKey, file.buffer, file.mimetype);
      } catch (error) {
        return sendError(res, 500, "Failed to store invoice file", error);
      }
    }

    try {
      const inserted = await db.query<InvoiceRow>(
        `INSERT INTO income_invoices (
           user_id, period_start, period_end, source, total_amount, received_date, tax_year,
           invoice_storage_path, invoice_original_filename, notes, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
         RETURNING ${invoiceColumns}`,
        [
          authReq.userId,
          data.period_start,
          data.period_end,
          data.source,
          data.total_amount,
          data.received_date,
          taxYear,
          storageKey,
          file?.originalname ?? null,
          data.notes ?? null
        ]
      );

      const summary = await recomputeTaxSummary(authReq.userId, taxYear);
      return res.status(201).json({ invoice: serializeInvoice(req, authReq, inserted.rows[0]), summary });
    } catch (error) {
      if (storageKey) {
        await deleteReceiptObject(storageKey).catch(() => {});
      }
      return sendError(res, 500, "Failed to save income invoice", error);
    }
  }
);

incomeRouter.get("/income-invoices", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const parsed = incomeInvoiceListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
  }
  const q = parsed.data;

  const conditions: string[] = ["user_id = $1"];
  const params: unknown[] = [authReq.userId];

  if (!q.include_voided) {
    conditions.push("voided_at IS NULL");
  }
  if (q.tax_year) {
    params.push(q.tax_year);
    conditions.push(`tax_year = $${params.length}`);
  }
  if (q.from) {
    params.push(q.from);
    conditions.push(`period_end >= $${params.length}`);
  }
  if (q.to) {
    params.push(q.to);
    conditions.push(`period_start <= $${params.length}`);
  }
  if (q.source) {
    params.push(q.source);
    conditions.push(`source = $${params.length}`);
  }

  try {
    const rows = await db.query<InvoiceRow>(
      `SELECT ${invoiceColumns}
       FROM income_invoices
       WHERE ${conditions.join(" AND ")}
       ORDER BY received_date DESC, created_at DESC`,
      params
    );

    return res.json({ invoices: rows.rows.map((row) => serializeInvoice(req, authReq, row)) });
  } catch (error) {
    return sendError(res, 500, "Failed to list income invoices", error);
  }
});

incomeRouter.get("/income-invoices/:id", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;

  try {
    const result = await db.query<InvoiceRow>(
      `SELECT ${invoiceColumns} FROM income_invoices WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [req.params.id, authReq.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Income invoice not found" });
    }

    return res.json({ invoice: serializeInvoice(req, authReq, result.rows[0]) });
  } catch (error) {
    return sendError(res, 500, "Failed to load income invoice", error);
  }
});

incomeRouter.post("/income-invoices/:id/void", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const parsed = voidSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  try {
    const result = await db.query<{ tax_year: string }>(
      `UPDATE income_invoices
       SET voided_at = NOW(), void_reason = $3
       WHERE id = $1 AND user_id = $2 AND voided_at IS NULL
       RETURNING tax_year`,
      [req.params.id, authReq.userId, parsed.data.reason]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Income invoice not found or already voided" });
    }

    const summary = await recomputeTaxSummary(authReq.userId, result.rows[0].tax_year);
    return res.json({ voided: true, summary });
  } catch (error) {
    return sendError(res, 500, "Failed to void income invoice", error);
  }
});

incomeRouter.get("/income-invoices/:id/download", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const invoiceId = req.params.id;
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
    if (payload.purpose !== "invoice-download" || payload.sub !== authReq.userId || payload.iid !== invoiceId) {
      return res.status(401).json({ error: "Invalid download token" });
    }
  } catch {
    return res.status(401).json({ error: "Invalid or expired download token" });
  }

  try {
    const result = await db.query<{ invoice_storage_path: string | null; invoice_original_filename: string | null }>(
      "SELECT invoice_storage_path, invoice_original_filename FROM income_invoices WHERE id = $1 AND user_id = $2 LIMIT 1",
      [invoiceId, authReq.userId]
    );

    if (result.rows.length === 0 || !result.rows[0].invoice_storage_path) {
      return res.status(404).json({ error: "Invoice file not found" });
    }

    const row = result.rows[0];
    const presignedUrl = await getReceiptPresignedUrl(row.invoice_storage_path as string, row.invoice_original_filename ?? "invoice");
    return res.redirect(302, presignedUrl);
  } catch (error) {
    return sendError(res, 500, "Failed to load invoice file", error);
  }
});
