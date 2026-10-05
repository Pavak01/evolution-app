import { z } from "zod";

export const authSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200)
});

// Sign-up from builds that show the terms tick-box sends the version the
// person agreed to. Optional so builds without the tick-box (111) can
// still sign up; those accounts are asked to accept after signing in.
export const registerSchema = authSchema.extend({
  accepted_terms_version: z.string().max(40).optional()
});

export const acceptTermsSchema = z.object({ version: z.string().max(40) });

export const twoFactorVerifySchema = z.object({
  challenge_token: z.string().min(1),
  // 6-digit authenticator code, or a backup code like ABCD-EFGH
  code: z.string().trim().min(6).max(12)
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

export const verifyEmailSchema = z.object({
  verification_token: z.string().min(1),
  code: z.string().trim().min(4).max(12)
});

export const resendVerificationSchema = z.object({
  verification_token: z.string().min(1)
});

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email()
});

export const passwordResetConfirmSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().min(4).max(12),
  new_password: z.string().min(8).max(200)
});
