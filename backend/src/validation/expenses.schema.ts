import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date (YYYY-MM-DD)");

// The columns are NUMERIC(x,2), so Postgres would silently round extra
// decimals on store — and then the net_deductible CHECK would be comparing
// against a value computed from the unrounded input. Reject them instead.
const hasAtMost2dp = (value: number): boolean => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
const money = z.coerce.number().refine(hasAtMost2dp, "must have at most 2 decimal places");

export const expenseWriteSchema = z
  .object({
    category: z.string().trim().min(1).max(100),
    occurred_at: isoDate,
    payment_method: z.enum(["cash", "card"]),
    total_amount: money.pipe(z.number().positive()),
    reimbursement_status: z.enum(["none", "partial", "full"]).default("none"),
    reimbursed_amount: money.pipe(z.number().min(0)).optional(),
    business_use_percent: money.pipe(z.number().min(1).max(100)).default(100),
    notes: z.string().trim().max(1000).optional(),
    // Lets a retry after a lost response (e.g. a transient gateway error)
    // return the original result instead of creating a real duplicate.
    idempotency_key: z.string().trim().min(1).max(200).optional(),
    // OCR-only enrichment used for duplicate matching — never a manual-entry field.
    transaction_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    // Set by the "Resubmit" flow only — the backend still verifies this
    // actually belongs to the caller and is voided before storing it.
    resubmitted_from_expense_id: z.string().uuid().optional()
  })
  .superRefine((data, ctx) => {
    const reimbursed = data.reimbursed_amount ?? 0;

    if (data.occurred_at > new Date().toISOString().slice(0, 10)) {
      ctx.addIssue({ code: "custom", path: ["occurred_at"], message: "occurred_at cannot be in the future" });
    }

    if (data.reimbursement_status === "none" && reimbursed !== 0) {
      ctx.addIssue({
        code: "custom",
        path: ["reimbursed_amount"],
        message: "reimbursed_amount must be 0 (or omitted) when reimbursement_status is none"
      });
    }

    if (data.reimbursement_status === "partial" && !(reimbursed > 0 && reimbursed < data.total_amount)) {
      ctx.addIssue({
        code: "custom",
        path: ["reimbursed_amount"],
        message: "reimbursed_amount must be greater than 0 and less than total_amount when reimbursement_status is partial"
      });
    }

    if (data.reimbursement_status === "full" && data.reimbursed_amount !== undefined && reimbursed !== data.total_amount) {
      ctx.addIssue({
        code: "custom",
        path: ["reimbursed_amount"],
        message: "reimbursed_amount must equal total_amount (or be omitted) when reimbursement_status is full"
      });
    }
  });

export type ExpenseWriteInput = z.infer<typeof expenseWriteSchema>;

// The server, never the client, is the source of truth for these derived
// amounts — mirrors the expenses_net_deductible_matches CHECK constraint.
// status 'full' -> 0; otherwise (total - reimbursed), both x business use %.
//
// Done in exact integer pennies with half-up rounding, matching Postgres'
// ROUND(numeric, 2). Floating point (Math.round(x * 100) / 100) disagrees
// with it by a penny on ~1% of half-penny results (e.g. £0.29 at 50% ->
// 0.14 vs 0.15), which the CHECK constraint then rejects as a 500.
// Inputs are already validated to at most 2 decimal places.
export function computeNetDeductible(
  totalAmount: number,
  reimbursementStatus: "none" | "partial" | "full",
  reimbursedAmount: number,
  businessUsePercent: number
): number {
  const bornePennies =
    reimbursementStatus === "full" ? 0n : BigInt(Math.round(totalAmount * 100) - Math.round(reimbursedAmount * 100));
  const buHundredths = BigInt(Math.round(businessUsePercent * 100));
  // pennies x (percent x 100) is in units of 1/10000 of a penny.
  const netPennies = (bornePennies * buHundredths + 5000n) / 10000n;
  return Number(netPennies) / 100;
}

// Create path only: reimbursement is never known at capture time — a firm
// that reimburses does so later, as a separate payment never folded into
// any income record. So a new expense always starts at reimbursed 0; real
// values are only ever written afterwards via POST /expenses/:id/reimbursement.
export function deriveExpenseAmounts(data: ExpenseWriteInput): {
  reimbursed_amount: number;
  net_deductible_amount: number;
} {
  return {
    reimbursed_amount: 0,
    net_deductible_amount: computeNetDeductible(data.total_amount, "none", 0, data.business_use_percent)
  };
}

// Amount-vs-total checks happen in the route after loading the row — zod
// has no access to the stored total_amount here.
export const reimbursementUpdateSchema = z.object({
  reimbursement_status: z.enum(["none", "partial", "full"]),
  reimbursed_amount: money.pipe(z.number().min(0)).optional()
});

export const voidSchema = z.object({
  reason: z.string().trim().min(1).max(500)
});

export const expenseListQuerySchema = z.object({
  tax_year: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  category: z.string().trim().min(1).max(100).optional(),
  reimbursement_status: z.enum(["none", "partial", "full"]).optional(),
  include_voided: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  // Free text, matched against category and notes — lets a receipt be found
  // instead of scrolled to, once there are thousands of them.
  search: z.string().trim().min(1).max(200).optional(),
  min_amount: z.coerce.number().min(0).optional(),
  max_amount: z.coerce.number().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  // Opaque — the client only ever echoes back a next_cursor it was handed.
  cursor: z.string().optional()
});
