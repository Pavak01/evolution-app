import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date (YYYY-MM-DD)");

export const expenseWriteSchema = z
  .object({
    category: z.string().trim().min(1).max(100),
    occurred_at: isoDate,
    payment_method: z.enum(["cash", "card"]),
    total_amount: z.coerce.number().positive(),
    reimbursement_status: z.enum(["none", "partial", "full"]).default("none"),
    reimbursed_amount: z.coerce.number().min(0).optional(),
    business_use_percent: z.coerce.number().min(1).max(100).default(100),
    notes: z.string().trim().max(1000).optional(),
    // Lets a retry after a lost response (e.g. a transient gateway error)
    // return the original result instead of creating a real duplicate.
    idempotency_key: z.string().trim().min(1).max(200).optional(),
    // OCR-only enrichment used for duplicate matching — never a manual-entry field.
    transaction_time: z.string().regex(/^\d{2}:\d{2}$/).optional()
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

const round2 = (value: number): number => Math.round(value * 100) / 100;

// The server, never the client, is the source of truth for these derived
// amounts — mirrors the expenses_net_deductible_matches CHECK constraint.
export function deriveExpenseAmounts(data: ExpenseWriteInput): {
  reimbursed_amount: number;
  net_deductible_amount: number;
} {
  const reimbursedAmount =
    data.reimbursement_status === "full"
      ? data.total_amount
      : data.reimbursement_status === "partial"
        ? (data.reimbursed_amount as number)
        : 0;

  const preApportioned = data.reimbursement_status === "full" ? 0 : data.total_amount - reimbursedAmount;
  const netDeductibleAmount = round2((preApportioned * data.business_use_percent) / 100);

  return { reimbursed_amount: reimbursedAmount, net_deductible_amount: netDeductibleAmount };
}

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
    .transform((v) => v === "true")
});
