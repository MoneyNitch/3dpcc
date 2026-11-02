import { z } from "zod";

export const passwordPolicySchema = z.strictObject({
  minLength: z.number().int().min(4).max(128),
  requireUppercase: z.boolean(),
  requireLowercase: z.boolean(),
  requireNumber: z.boolean(),
  requireSpecial: z.boolean(),
});

export type PasswordPolicy = z.infer<typeof passwordPolicySchema>;

export const defaultPasswordPolicy: PasswordPolicy = {
  minLength: 12,
  requireUppercase: false,
  requireLowercase: false,
  requireNumber: false,
  requireSpecial: false,
};

export const passwordCharacterRules = [
  { key: "requireUppercase", pattern: /\p{Lu}/u, error: "passwordUppercase" },
  { key: "requireLowercase", pattern: /\p{Ll}/u, error: "passwordLowercase" },
  { key: "requireNumber", pattern: /\p{Nd}/u, error: "passwordNumber" },
  { key: "requireSpecial", pattern: /[\p{P}\p{S}]/u, error: "passwordSpecial" },
] as const;

export function passwordPolicyError(password: string, policy: PasswordPolicy) {
  if (password.length < policy.minLength) return "passwordTooShort";
  if (password.length > 128) return "passwordTooLong";
  if (password === "admin") return "passwordReserved";
  for (const rule of passwordCharacterRules) {
    if (policy[rule.key] && !rule.pattern.test(password)) return rule.error;
  }
  return undefined;
}
