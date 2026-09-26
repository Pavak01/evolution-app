import { Router, type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { getReceiptDownloadUrl } from "../auth/tokens.js";
import { humanizeCategory } from "../categoryDisplay.js";
import { db } from "../db.js";
import { isOcrUpgradeActive } from "../entitlements.js";
import { sendError } from "../middleware/errorHandler.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { uploadRateLimit } from "../middleware/rateLimit.js";
import { upload } from "../middleware/upload.js";
import { extractReceiptFields } from "../receiptExtraction.js";
import {
  computeReceiptContentHash,
  deleteReceiptObject,
  normalizeImageOrientation,
  receiptContentMatchesDeclaredType,
  uploadReceiptObject
} from "../receiptStorage.js";
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
  business_use_percent: string;
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
    business_use_percent: Number(row.business_use_percent),
    notes: row.notes,
    voided_at: row.voided_at,
    void_reason: row.void_reason,
    created_at: row.created_at
  };
}

type DuplicateWarning = { expense_id: string; message: string } | null;

// Columns from a LEFT JOIN against the expense (if any, and if it's still
// non-voided — an acted-on duplicate stops being flagged) referenced by
// duplicate_of_expense_id, the persisted counterpart to the one-time
// duplicate_warning below: set once at save/attach time, but recomputed
// fresh from live data on every read so it never shows stale details and
// clears itself once the flagged expense is voided.
type DuplicateJoinRow = {
  dup_id: string | null;
  dup_occurred_at: string | null;
  dup_category: string | null;
  dup_total_amount: string | null;
};

function serializePossibleDuplicate(row: DuplicateJoinRow): DuplicateWarning {
  if (!row.dup_id || !row.dup_occurred_at || !row.dup_category || row.dup_total_amount === null) {
    return null;
  }
  return {
    expense_id: row.dup_id,
    message: `This looks similar to one you logged on ${row.dup_occurred_at} for ${humanizeCategory(row.dup_category)} (£${Number(row.dup_total_amount).toFixed(2)}) — open it to void if this is a duplicate.`
  };
}

const duplicateJoin = `LEFT JOIN expenses d ON d.id = e.duplicate_of_expense_id AND d.voided_at IS NULL`;
const duplicateJoinColumns = `d.id AS dup_id, d.occurred_at::text AS dup_occurred_at, d.category AS dup_category, d.total_amount::text AS dup_total_amount`;

// Never blocks or delays a save — this only ever runs after the write has
// committed, and is purely informational (see the void-with-reason
// correction flow the message points users at).
async function findDuplicateWarning(
  userId: string,
  expenseId: string,
  contentHash: string | null,
  category: string,
  totalAmount: number,
  occurredAt: string,
  transactionTime: string | null
): Promise<DuplicateWarning> {
  if (contentHash) {
    const hashMatch = await db.query<{ expense_id: string; occurred_at: string; category: string; total_amount: string }>(
      `SELECT r.expense_id, e.occurred_at::text, e.category, e.total_amount::text
       FROM receipts r
       JOIN expenses e ON e.id = r.expense_id
       WHERE r.user_id = $1 AND r.content_hash = $2 AND r.expense_id != $3
       ORDER BY r.created_at ASC
       LIMIT 1`,
      [userId, contentHash, expenseId]
    );
    if (hashMatch.rows.length > 0) {
      const match = hashMatch.rows[0];
      return {
        expense_id: match.expense_id,
        message: `This looks like the same receipt as one you logged on ${match.occurred_at} for ${humanizeCategory(match.category)} (£${Number(match.total_amount).toFixed(2)}) — open it to void if this is a duplicate.`
      };
    }
  }

  const metadataMatches = await db.query<{
    id: string;
    occurred_at: string;
    category: string;
    total_amount: string;
    transaction_time: string | null;
  }>(
    `SELECT id, occurred_at::text, category, total_amount::text, transaction_time
     FROM expenses
     WHERE user_id = $1 AND id != $2 AND voided_at IS NULL AND category = $3 AND total_amount = $4 AND occurred_at = $5`,
    [userId, expenseId, category, totalAmount, occurredAt]
  );

  // When both this expense and a candidate have a printed transaction time,
  // require it to match too — turns a moderate-confidence date-level match
  // into a high-confidence minute-level one, and rules out same-day/same-
  // amount coincidences that a time mismatch actually disproves.
  const eligible = metadataMatches.rows.filter(
    (row) => !(transactionTime && row.transaction_time && row.transaction_time !== transactionTime)
  );
  if (eligible.length === 0) {
    return null;
  }

  const timeMatched = eligible.find((row) => transactionTime && row.transaction_time === transactionTime);
  const candidate = timeMatched ?? eligible[0];
  const message = timeMatched
    ? `This looks like the same transaction as one you logged on ${candidate.occurred_at} for ${humanizeCategory(candidate.category)} (£${Number(candidate.total_amount).toFixed(2)}) — open it to void if this is a duplicate.`
    : `This looks similar to one you logged on ${candidate.occurred_at} for ${humanizeCategory(candidate.category)} (£${Number(candidate.total_amount).toFixed(2)}) — open it to void if this is a duplicate.`;

  return { expense_id: candidate.id, message };
}

async function loadExpenseResponse(
  req: Request,
  authReq: AuthenticatedRequest,
  expenseId: string
): Promise<{
  expense: ReturnType<typeof serializeExpense> & { receipt_download_url: string | null; possible_duplicate: DuplicateWarning };
  summary: Awaited<ReturnType<typeof recomputeTaxSummary>>;
}> {
  const result = await db.query<ExpenseRow & { receipt_id: string | null } & DuplicateJoinRow>(
    `SELECT e.id, e.category, e.occurred_at::text, e.tax_year, e.payment_method, e.total_amount::text,
            e.reimbursement_status, e.reimbursed_amount::text, e.net_deductible_amount::text,
            e.business_use_percent::text, e.notes, e.voided_at::text, e.void_reason, e.created_at::text,
            r.id AS receipt_id, ${duplicateJoinColumns}
     FROM expenses e
     LEFT JOIN receipts r ON r.expense_id = e.id
     ${duplicateJoin}
     WHERE e.id = $1 AND e.user_id = $2
     LIMIT 1`,
    [expenseId, authReq.userId]
  );
  const row = result.rows[0];
  const summary = await recomputeTaxSummary(authReq.userId, row.tax_year);
  return {
    expense: {
      ...serializeExpense(row),
      receipt_download_url: row.receipt_id ? getReceiptDownloadUrl(req, authReq.userId, row.receipt_id) : null,
      possible_duplicate: serializePossibleDuplicate(row)
    },
    summary
  };
}

// Single multipart request: the receipt photo plus its fields are normally
// captured together at point of sale, matching the real-world action this
// app is built around. `travel` is the one exception — its receipt is
// nearly always retrievable only after the fact (a bank statement, an app
// payment history, an emailed confirmation), never a photographable receipt
// in the moment, so it can be saved with no file and completed later via
// POST /expenses/:id/receipt below. Every other category still requires
// one, since a photographable receipt genuinely is available at capture
// time for those.
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

    const data = parsed.data;
    const isTravel = data.category.trim().toLowerCase() === "travel";

    if (!req.file && !isTravel) {
      return res.status(400).json({ error: "receipt file is required" });
    }

    if (req.file && !receiptContentMatchesDeclaredType(req.file.buffer, req.file.mimetype)) {
      return res.status(400).json({ error: "File content does not match its declared type" });
    }

    // Bakes any EXIF "rotate on display" flag into the actual pixels before
    // anything else touches this buffer — storage, the duplicate-detection
    // hash, and OCR all then see the same, correctly-oriented image.
    const normalizedBuffer = req.file ? await normalizeImageOrientation(req.file.buffer, req.file.mimetype) : null;

    // A retry after a lost response (e.g. a transient gateway error) should
    // return the original result, not create a real duplicate. Cheap pre-
    // check to skip a pointless re-upload in the common case — the unique
    // index on (user_id, idempotency_key) below is the actual source of
    // truth if two retries ever race each other.
    if (data.idempotency_key) {
      const existing = await db.query<{ id: string }>(
        "SELECT id FROM expenses WHERE user_id = $1 AND idempotency_key = $2 LIMIT 1",
        [authReq.userId, data.idempotency_key]
      );
      if (existing.rows.length > 0) {
        const response = await loadExpenseResponse(req, authReq, existing.rows[0].id);
        return res.status(200).json({ ...response, duplicate_warning: null });
      }
    }

    const { reimbursed_amount, net_deductible_amount } = deriveExpenseAmounts(data);
    const taxYear = getTaxYearFromDate(data.occurred_at);

    const safeName = req.file ? req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_") : null;
    const storageKey = req.file ? `receipts/${authReq.userId}/${uuidv4()}-${safeName}` : null;
    const contentHash = normalizedBuffer ? computeReceiptContentHash(normalizedBuffer) : null;

    if (req.file && normalizedBuffer && storageKey) {
      try {
        await uploadReceiptObject(storageKey, normalizedBuffer, req.file.mimetype);
      } catch (error) {
        return sendError(res, 500, "Failed to store receipt", error);
      }
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const expenseInsert = await client.query<ExpenseRow>(
        `INSERT INTO expenses (
           user_id, category, occurred_at, tax_year, payment_method, total_amount,
           reimbursement_status, reimbursed_amount, net_deductible_amount, business_use_percent, notes,
           idempotency_key, transaction_time, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
         ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
         RETURNING id, category, occurred_at::text, tax_year, payment_method, total_amount::text,
                   reimbursement_status, reimbursed_amount::text, net_deductible_amount::text,
                   business_use_percent::text, notes, voided_at::text, void_reason, created_at::text`,
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
          data.business_use_percent,
          data.notes ?? null,
          data.idempotency_key ?? null,
          data.transaction_time ?? null
        ]
      );

      if (expenseInsert.rows.length === 0) {
        // Lost the race to a concurrent retry with the same idempotency_key
        // — nothing else was written, so just roll back and echo the winner
        // (client.release() happens in `finally`, not here).
        await client.query("ROLLBACK");
        if (storageKey) {
          await deleteReceiptObject(storageKey).catch(() => {});
        }
        const existing = await db.query<{ id: string }>(
          "SELECT id FROM expenses WHERE user_id = $1 AND idempotency_key = $2 LIMIT 1",
          [authReq.userId, data.idempotency_key]
        );
        const response = await loadExpenseResponse(req, authReq, existing.rows[0].id);
        return res.status(200).json({ ...response, duplicate_warning: null });
      }

      const expense = expenseInsert.rows[0];
      let receiptId: string | null = null;

      if (req.file && storageKey) {
        const receiptInsert = await client.query<{ id: string }>(
          `INSERT INTO receipts (expense_id, user_id, original_filename, storage_path, mime_type, file_size_bytes, content_hash, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           RETURNING id`,
          [expense.id, authReq.userId, req.file.originalname, storageKey, req.file.mimetype, req.file.size, contentHash]
        );
        receiptId = receiptInsert.rows[0].id;
      }

      await client.query("COMMIT");

      const summary = await recomputeTaxSummary(authReq.userId, taxYear);
      const duplicateWarning = await findDuplicateWarning(
        authReq.userId,
        expense.id,
        contentHash,
        data.category,
        data.total_amount,
        data.occurred_at,
        data.transaction_time ?? null
      );

      // Persists the same signal duplicate_warning carries below so it
      // survives past this one response — History can then show it as a
      // badge whenever this expense is viewed later, not just right now.
      // Best-effort: the save already succeeded, so a failure here should
      // never turn into an error response.
      if (duplicateWarning) {
        await db
          .query("UPDATE expenses SET duplicate_of_expense_id = $1 WHERE id = $2", [duplicateWarning.expense_id, expense.id])
          .catch(() => {});
      }

      return res.status(201).json({
        expense: {
          ...serializeExpense(expense),
          receipt_download_url: receiptId ? getReceiptDownloadUrl(req, authReq.userId, receiptId) : null,
          possible_duplicate: duplicateWarning
        },
        summary,
        duplicate_warning: duplicateWarning
      });
    } catch (error) {
      await client.query("ROLLBACK");
      // Best-effort cleanup: an orphan S3 object is harmless clutter, but a
      // receipts row without a matching expense (or vice versa) would break
      // this model's core invariant, so the DB transaction is the source of
      // truth and the upload is compensated after the fact on failure.
      if (storageKey) {
        await deleteReceiptObject(storageKey).catch(() => {});
      }
      return sendError(res, 500, "Failed to save expense", error);
    } finally {
      client.release();
    }
  }
);

// Completes a travel expense saved without a receipt at capture time — see
// the comment on POST /expenses above. Requires the expense to not already
// have one (the receipts.expense_id UNIQUE constraint enforces this at the
// DB level too, so a race here fails safely rather than corrupting data).
expensesRouter.post(
  "/expenses/:id/receipt",
  requireAuth,
  uploadRateLimit,
  upload.single("receipt"),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;

    if (!req.file) {
      return res.status(400).json({ error: "receipt file is required" });
    }

    if (!receiptContentMatchesDeclaredType(req.file.buffer, req.file.mimetype)) {
      return res.status(400).json({ error: "File content does not match its declared type" });
    }

    const normalizedBuffer = await normalizeImageOrientation(req.file.buffer, req.file.mimetype);

    try {
      const expenseResult = await db.query<{ id: string; tax_year: string; category: string; total_amount: string; occurred_at: string; transaction_time: string | null }>(
        "SELECT id, tax_year, category, total_amount::text, occurred_at::text, transaction_time FROM expenses WHERE id = $1 AND user_id = $2 AND voided_at IS NULL LIMIT 1",
        [req.params.id, authReq.userId]
      );
      if (expenseResult.rows.length === 0) {
        return res.status(404).json({ error: "Expense not found" });
      }

      const existing = await db.query<{ id: string }>("SELECT id FROM receipts WHERE expense_id = $1 LIMIT 1", [req.params.id]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: "This expense already has a receipt attached" });
      }

      const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storageKey = `receipts/${authReq.userId}/${uuidv4()}-${safeName}`;
      const contentHash = computeReceiptContentHash(normalizedBuffer);

      try {
        await uploadReceiptObject(storageKey, normalizedBuffer, req.file.mimetype);
      } catch (error) {
        return sendError(res, 500, "Failed to store receipt", error);
      }

      let receiptId: string;
      try {
        const receiptInsert = await db.query<{ id: string }>(
          `INSERT INTO receipts (expense_id, user_id, original_filename, storage_path, mime_type, file_size_bytes, content_hash, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           RETURNING id`,
          [req.params.id, authReq.userId, req.file.originalname, storageKey, req.file.mimetype, req.file.size, contentHash]
        );
        receiptId = receiptInsert.rows[0].id;
      } catch (error) {
        await deleteReceiptObject(storageKey).catch(() => {});
        return sendError(res, 500, "Failed to save receipt", error);
      }

      const expenseRow = await db.query<ExpenseRow>(
        `SELECT id, category, occurred_at::text, tax_year, payment_method, total_amount::text,
                reimbursement_status, reimbursed_amount::text, net_deductible_amount::text,
                business_use_percent::text, notes, voided_at::text, void_reason, created_at::text
         FROM expenses WHERE id = $1`,
        [req.params.id]
      );

      const summary = await recomputeTaxSummary(authReq.userId, expenseResult.rows[0].tax_year);
      const expenseInfo = expenseResult.rows[0];
      const duplicateWarning = await findDuplicateWarning(
        authReq.userId,
        expenseInfo.id,
        contentHash,
        expenseInfo.category,
        Number(expenseInfo.total_amount),
        expenseInfo.occurred_at,
        expenseInfo.transaction_time
      );

      if (duplicateWarning) {
        await db
          .query("UPDATE expenses SET duplicate_of_expense_id = $1 WHERE id = $2", [duplicateWarning.expense_id, expenseInfo.id])
          .catch(() => {});
      }

      return res.status(201).json({
        expense: {
          ...serializeExpense(expenseRow.rows[0]),
          receipt_download_url: getReceiptDownloadUrl(req, authReq.userId, receiptId),
          possible_duplicate: duplicateWarning
        },
        summary,
        duplicate_warning: duplicateWarning
      });
    } catch (error) {
      return sendError(res, 500, "Failed to attach receipt", error);
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

      const normalizedBuffer = await normalizeImageOrientation(req.file.buffer, req.file.mimetype);
      const result = await extractReceiptFields(normalizedBuffer, req.file.mimetype);
      return res.json(result);
    } catch (error) {
      return sendError(res, 500, "Failed to extract receipt fields", error);
    }
  }
);

function encodeExpenseCursor(occurredAt: string, createdAt: string, id: string): string {
  return Buffer.from(`${occurredAt}|${createdAt}|${id}`, "utf-8").toString("base64");
}

function decodeExpenseCursor(cursor: string): { occurredAt: string; createdAt: string; id: string } | null {
  try {
    const [occurredAt, createdAt, id] = Buffer.from(cursor, "base64").toString("utf-8").split("|");
    if (!occurredAt || !createdAt || !id) return null;
    return { occurredAt, createdAt, id };
  } catch {
    return null;
  }
}

const DEFAULT_EXPENSE_PAGE_SIZE = 50;

// A separate top-level path (not nested under /expenses/:id) so there's no
// Express route-ordering collision with the :id param route below. Backs
// the category picker on Capture/Import/History's filter — every category
// the user has actually used, including a custom one they typed
// themselves, not just the fixed suggestion list. Includes voided
// expenses' categories too: the category name is still a real one they
// might use again, independent of that one entry later being voided.
expensesRouter.get("/expense-categories", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const result = await db.query<{ category: string }>(
      "SELECT DISTINCT category FROM expenses WHERE user_id = $1 ORDER BY category ASC",
      [authReq.userId]
    );
    return res.json({ categories: result.rows.map((row) => row.category) });
  } catch (error) {
    return sendError(res, 500, "Failed to load categories", error);
  }
});

expensesRouter.get("/expenses", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const parsed = expenseListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
  }
  const q = parsed.data;
  const limit = q.limit ?? DEFAULT_EXPENSE_PAGE_SIZE;

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
  if (q.search) {
    params.push(`%${q.search}%`);
    conditions.push(`(e.category ILIKE $${params.length} OR e.notes ILIKE $${params.length})`);
  }
  if (q.min_amount !== undefined) {
    params.push(q.min_amount);
    conditions.push(`e.total_amount >= $${params.length}`);
  }
  if (q.max_amount !== undefined) {
    params.push(q.max_amount);
    conditions.push(`e.total_amount <= $${params.length}`);
  }
  if (q.cursor) {
    const decoded = decodeExpenseCursor(q.cursor);
    if (!decoded) {
      return res.status(400).json({ error: "Invalid cursor" });
    }
    params.push(decoded.occurredAt, decoded.createdAt, decoded.id);
    conditions.push(`(e.occurred_at, e.created_at, e.id) < ($${params.length - 2}, $${params.length - 1}, $${params.length})`);
  }

  params.push(limit + 1);

  try {
    const rows = await db.query<ExpenseRow & { receipt_id: string | null } & DuplicateJoinRow>(
      `SELECT e.id, e.category, e.occurred_at::text, e.tax_year, e.payment_method, e.total_amount::text,
              e.reimbursement_status, e.reimbursed_amount::text, e.net_deductible_amount::text,
              e.business_use_percent::text, e.notes, e.voided_at::text, e.void_reason, e.created_at::text,
              r.id AS receipt_id, ${duplicateJoinColumns}
       FROM expenses e
       LEFT JOIN receipts r ON r.expense_id = e.id
       ${duplicateJoin}
       WHERE ${conditions.join(" AND ")}
       ORDER BY e.occurred_at DESC, e.created_at DESC, e.id DESC
       LIMIT $${params.length}`,
      params
    );

    const hasMore = rows.rows.length > limit;
    const page = hasMore ? rows.rows.slice(0, limit) : rows.rows;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? encodeExpenseCursor(last.occurred_at, last.created_at, last.id) : null;

    return res.json({
      expenses: page.map((row) => ({
        ...serializeExpense(row),
        receipt_download_url: row.receipt_id ? getReceiptDownloadUrl(req, authReq.userId, row.receipt_id) : null,
        possible_duplicate: serializePossibleDuplicate(row)
      })),
      next_cursor: nextCursor
    });
  } catch (error) {
    return sendError(res, 500, "Failed to list expenses", error);
  }
});

expensesRouter.get("/expenses/:id", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;

  try {
    const result = await db.query<ExpenseRow & { receipt_id: string | null } & DuplicateJoinRow>(
      `SELECT e.id, e.category, e.occurred_at::text, e.tax_year, e.payment_method, e.total_amount::text,
              e.reimbursement_status, e.reimbursed_amount::text, e.net_deductible_amount::text,
              e.business_use_percent::text, e.notes, e.voided_at::text, e.void_reason, e.created_at::text,
              r.id AS receipt_id, ${duplicateJoinColumns}
       FROM expenses e
       LEFT JOIN receipts r ON r.expense_id = e.id
       ${duplicateJoin}
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
        receipt_download_url: row.receipt_id ? getReceiptDownloadUrl(req, authReq.userId, row.receipt_id) : null,
        possible_duplicate: serializePossibleDuplicate(row)
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
