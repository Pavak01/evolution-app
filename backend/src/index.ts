import "dotenv/config";
import cors from "cors";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { processEvolutionAccountDeletions } from "./accountDeletion.js";
import { allowedOrigins, isProduction, port } from "./config.js";
import { finalErrorHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./routes/auth.routes.js";
import { expensesRouter } from "./routes/expenses.routes.js";
import { healthRouter } from "./routes/health.routes.js";
import { incomeRouter } from "./routes/income.routes.js";
import { receiptsRouter } from "./routes/receipts.routes.js";
import { taxRouter } from "./routes/tax.routes.js";

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (isProduction) {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
});

app.use(
  cors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed"));
    }
  })
);

app.use(express.json({ limit: "1mb" }));

app.use(healthRouter);
app.use(authRouter);
app.use(expensesRouter);
app.use(receiptsRouter);
app.use(incomeRouter);
app.use(taxRouter);

app.use(finalErrorHandler);

app.listen(port, () => {
  console.log(`Evolution backend running on port ${port}`);

  // Qbit's equivalent job only ever runs once, at startup — relying on the
  // service happening to restart within the 30-day grace period to notice
  // a pending deletion at all. Running on an interval too closes that gap.
  void processEvolutionAccountDeletions();
  setInterval(() => void processEvolutionAccountDeletions(), 24 * 60 * 60 * 1000);
});
