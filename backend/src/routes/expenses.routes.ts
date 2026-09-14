import { Router, type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { getReceiptDownloadUrl } from "../auth/tokens.js";
import { db } from "../db.js";
import { isOcrUpgradeActive } from "../entitlements.js";
import { sendError } from "../middleware/errorHandler.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { uploadRateLimit } from "../middleware/rateLimit.js";
import { upload } from "../middleware/upload.js";
import { extractReceiptFields } from "../receiptExtraction.js";
import { deleteReceiptObject, receiptContentMatchesDeclaredType, uploadReceiptObject } from "../receiptStorage.js";
import { getTaxYearFromDate } from "../rulesEngine.js";
import { recomputeTaxSummary } from "../taxSummary.js";
import { deriveExpenseAmounts, expenseListQuerySchema, expenseWriteSchema, voidSchema } from "../validation/expenses.schema.js";

export const expensesRouter = Router();

type ExpenseRow = {
  id: string;
  category: string;
  occurred_at: string;
  tax_year: string;
  payment_method: string;
  total_amount: string;
  reimbursement_status: string;
  reimbursed_amount: string;
  net_deductible_amount: string;
  notes: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
};

function serializeExpense(row: ExpenseRow) {
  return {
    id: row.id,
    category: row.category,
    occurred_at: row.occurred_at,
    tax_year: row.tax_year,
    payment_method: row.payment_method,
    total_amount: Number(row.total_amount),
    reimbursement_status: row.reimbursement_status,
    reimbursed_amount: Number(row.reimbursed_amount),
    net_deductible_amount: Number(row.net_deductible_amount),
    notes: row.notes,
    voided_at: row.voided_at,
    void_reason: row.void_reason,
    created_at: row.created_at
  };
}

// Single multipart request: the receipt photo plus its fields are captured
// together at point of sale, matching the real-world action this app is
// built around. receipts.expense_id is NOT NULL, so the upload must succeed
// before the expense row exists — see the transaction/compensation flow below.
expensesRouter.post(
  "/expenses",
  requireAuth,
  uploadRateLimit,
  upload.single("receipt"),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const parsed = expenseWriteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    }

    if (!req.file) {
      return res.status(400).json({ error: "receipt file is required" });
    }

    if (!receiptContentMatchesDeclaredType(req.file.buffer, req.file.mimetype)) {
      return res.status(400).json({ error: "File content does not match its declared type" });
    }

    const data = parsed.data;
    const { reimbursed_amount, net_deductible_amount } = deriveExpenseAmounts(data);
    const taxYear = getTaxYearFromDate(data.occurred_at);

    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageKey = `receipts/${authReq.userId}/${uuidv4()}-${safeName}`;

    try {
      await uploadReceiptObject(storageKey, req.file.buffer, req.file.mimetype);
    } catch (error) {
      return sendError(res, 500, "Failed to store receipt", error);
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const expenseInsert = await client.query<ExpenseRow>(
        `INSERT INTO expenses (
           user_id, category, occurred_at, tax_year, payment_method, total_amount,
           reimbursement_status, reimbursed_amount, net_deductible_amount, notes, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
         RETURNING id, category, occurred_at::text, tax_year, payment_method, total_amount::text,
                   reimbursement_status, reimbursed_amount::text, net_deductible_amount::text,
                   notes, voided_at::text, void_reason, created_at::text`,
        [
          authReq.userId,
          data.category,
          data.occurred_at,
          taxYear,
          data.payment_method,
          data.total_amount,
          data.reimbursement_status,
          reimbursed_amount,
          net_deductible_amount,
          data.notes ?? null
        ]
      );

      const expense = expenseInsert.rows[0];

      await client.query(
        `INSERT INTO receipts (expense_id, user_id, original_filename, storage_path, mime_type, file_size_bytes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [expense.id, authReq.userId, req.file.originalname, storageKey, req.file.mimetype, req.file.size]
      );

      await client.query("COMMIT");

      const summary = await recomputeTaxSummary(authReq.userId, taxYear);

      return res.status(201).json({
        expense: {
          ...serializeExpense(expense),
          receipt_download_url: getReceiptDownloadUrl(req, authReq.userId, expense.id)
        },
        summary
      });
    } catch (error) {
      await client.query("ROLLBACK");
      // Best-effort cleanup: an orphan S3 object is harmless clutter, but a
      // receipts row without a matching expense (or vice versa) would break
      // this model's core invariant, so the DB transaction is the source of
      // truth and the upload is compensated after the fact on failure.
      await deleteReceiptObject(storageKey).catch(() => {});
      return sendError(res, 500, "Failed to save expense", error);
    } finally {
      client.release();
    }
  }
);

// Paid-upgrade feature: reads the receipt and returns best-guess field
// values for the client to prefill — never persists anything, and never
// errors out on a bad/unclear photo (see receiptExtraction.ts). The user
// still reviews/edits and submits through POST /expenses as normal.
expensesRouter.post(
  "/expenses/extract-receipt",
  requireAuth,
  uploadRateLimit,
  upload.single("receipt"),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;

    if (!req.file) {
      return res.status(400).json({ error: "receipt file is required" });
    }

    try {
      const entitled = await isOcrUpgradeActive(authReq.userId);
      if (!entitled) {
        return res.status(403).json({ error: "OCR auto-fill is a paid upgrade and isn't enabled on this account." });
      }

      if (!receiptContentMatchesDeclaredType(req.file.buffer, req.file.mimetype)) {
        return res.status(400).json({ error: "File content does not match its declared type" });
      }

      const result = await extractReceiptFields(req.file.buffer, req.file.mimetype);
      return res.json(result);
    } catch (error) {
      return sendError(res, 500, "Failed to extract receipt fields", error);
    }
  }
);

expensesRouter.get("/expenses", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const parsed = expenseListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
  }
  const q = parsed.data;

  const conditions: string[] = ["e.user_id = $1"];
  const params: unknown[] = [authReq.userId];

  if (!q.include_voided) {
    conditions.push("e.voided_at IS NULL");
  }
  if (q.tax_year) {
    params.push(q.tax_year);
    conditions.push(`e.tax_year = $${params.length}`);
  }
  if (q.from) {
    params.push(q.from);
    conditions.push(`e.occurred_at >= $${params.length}`);
  }
  if (q.to) {
    params.push(q.to);
    conditions.push(`e.occurred_at <= $${params.length}`);
  }
  if (q.category) {
    params.push(q.category);
    conditions.push(`e.category = $${params.length}`);
  }
  if (q.reimbursement_status) {
    params.push(q.reimbursement_status);
    conditions.push(`e.reimbursement_status = $${params.length}`);
  }

  try {
    const rows = await db.query<ExpenseRow & { receipt_id: string }>(
      `SELECT e.id, e.category, e.occurred_at::text, e.tax_year, e.payment_method, e.total_amount::text,
              e.reimbursement_status, e.reimbursed_amount::text, e.net_deductible_amount::text,
              e.notes, e.voided_at::text, e.void_reason, e.created_at::text, r.id AS receipt_id
       FROM expenses e
       JOIN receipts r ON r.expense_id = e.id
       WHERE ${conditions.join(" AND ")}
       ORDER BY e.occurred_at DESC, e.created_at DESC`,
      params
    );

    return res.json({
      expenses: rows.rows.map((row) => ({
        ...serializeExpense(row),
        receipt_download_url: getReceiptDownloadUrl(req, authReq.userId, row.receipt_id)
      }))
    });
  } catch (error) {
    return sendError(res, 500, "Failed to list expenses", error);
  }
});

expensesRouter.get("/expenses/:id", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;

  try {
    const result = await db.query<ExpenseRow & { receipt_id: string }>(
      `SELECT e.id, e.category, e.occurred_at::text, e.tax_year, e.payment_method, e.total_amount::text,
              e.reimbursement_status, e.reimbursed_amount::text, e.net_deductible_amount::text,
              e.notes, e.voided_at::text, e.void_reason, e.created_at::text, r.id AS receipt_id
       FROM expenses e
       JOIN receipts r ON r.expense_id = e.id
       WHERE e.id = $1 AND e.user_id = $2
       LIMIT 1`,
      [req.params.id, authReq.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Expense not found" });
    }

    const row = result.rows[0];
    return res.json({
      expense: {
        ...serializeExpense(row),
        receipt_download_url: getReceiptDownloadUrl(req, authReq.userId, row.receipt_id)
      }
    });
  } catch (error) {
    return sendError(res, 500, "Failed to load expense", error);
  }
});

expensesRouter.post("/expenses/:id/void", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const parsed = voidSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  try {
    const result = await db.query<{ tax_year: string }>(
      `UPDATE expenses
       SET voided_at = NOW(), void_reason = $3
       WHERE id = $1 AND user_id = $2 AND voided_at IS NULL
       RETURNING tax_year`,
      [req.params.id, authReq.userId, parsed.data.reason]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Expense not found or already voided" });
    }

    const summary = await recomputeTaxSummary(authReq.userId, result.rows[0].tax_year);
    return res.json({ voided: true, summary });
  } catch (error) {
    return sendError(res, 500, "Failed to void expense", error);
  }
});
