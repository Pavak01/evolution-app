import { z } from "zod";

export const authSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200)
});
