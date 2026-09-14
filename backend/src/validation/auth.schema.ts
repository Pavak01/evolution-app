import { z } from "zod";

export const authSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200)
});

export const twoFactorVerifySchema = z.object({
  challenge_token: z.string().min(1),
  code: z.string().trim().min(6).max(6)
});

export const accountDeletionRequestSchema = z.object({
  message: z.string().trim().max(1000).optional()
});

// For the public (unauthenticated) deletion request — proving password
// knowledge is the whole point, since Google Play requires supporting a
// deletion request from someone who no longer has the app installed.
export const publicAccountDeletionRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  full_name: z.string().trim().min(2).max(200),
  message: z.string().trim().max(1000).optional()
});
