import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date (YYYY-MM-DD)");

export const incomeInvoiceWriteSchema = z
  .object({
    period_start: isoDate,
    period_end: isoDate,
    source: z.string().trim().min(1).max(200),
    total_amount: z.coerce.number().positive(),
    received_date: isoDate,
    notes: z.string().trim().max(1000).optional(),
    // Lets a retry after a lost response (e.g. a transient gateway error)
    // return the original result instead of creating a real duplicate.
    idempotency_key: z.string().trim().min(1).max(200).optional()
  })
  .superRefine((data, ctx) => {
    if (data.period_end < data.period_start) {
      ctx.addIssue({ code: "custom", path: ["period_end"], message: "period_end must be on or after period_start" });
    }

    if (data.received_date > new Date().toISOString().slice(0, 10)) {
      ctx.addIssue({ code: "custom", path: ["received_date"], message: "received_date cannot be in the future" });
    }
  });

export type IncomeInvoiceWriteInput = z.infer<typeof incomeInvoiceWriteSchema>;

export const incomeInvoiceListQuerySchema = z.object({
  tax_year: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  source: z.string().trim().min(1).max(200).optional(),
  include_voided: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true")
});
