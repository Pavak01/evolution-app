import { z } from "zod";

export const authSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200)
});

export const twoFactorVerifySchema = z.object({
  challenge_token: z.string().min(1),
  code: z.string().trim().min(6).max(6)
});
