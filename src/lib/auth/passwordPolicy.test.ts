import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultPasswordPolicy, passwordCharacterRules, passwordPolicyError, passwordPolicySchema } from "./passwordPolicy";

test("password policy defaults preserve the previous length requirement", () => {
  assert.equal(passwordPolicyError("a".repeat(11), defaultPasswordPolicy), "passwordTooShort");
  assert.equal(passwordPolicyError("a".repeat(12), defaultPasswordPolicy), undefined);
  assert.equal(passwordPolicyError("a".repeat(128), defaultPasswordPolicy), undefined);
  assert.equal(passwordPolicyError("a".repeat(129), defaultPasswordPolicy), "passwordTooLong");
});

test("password policies allow four characters and validate configuration bounds and types", () => {
  const policy = { ...defaultPasswordPolicy, minLength: 4 };
  assert.equal(passwordPolicySchema.safeParse(policy).success, true);
  assert.equal(passwordPolicySchema.safeParse({ ...policy, minLength: 128 }).success, true);
  for (const minLength of [0, 3, 129, 4.5, "4", null, NaN]) {
    assert.equal(passwordPolicySchema.safeParse({ ...policy, minLength }).success, false);
  }
  assert.equal(passwordPolicySchema.safeParse({ ...policy, requireUppercase: "true" }).success, false);
  assert.equal(passwordPolicySchema.safeParse({ ...policy, unexpected: true }).success, false);
  assert.equal(passwordPolicyError("abc", policy), "passwordTooShort");
  assert.equal(passwordPolicyError("abcd", policy), undefined);
  assert.equal(passwordPolicyError("1234", policy), undefined);
  assert.equal(passwordPolicyError("admin", policy), "passwordReserved");
});

test("each character requirement is optional and independently enforced", () => {
  const examples = [
    { key: "requireUppercase", invalid: "abcd", valid: "Abcd", error: "passwordUppercase" },
    { key: "requireLowercase", invalid: "ABCD", valid: "ABCd", error: "passwordLowercase" },
    { key: "requireNumber", invalid: "abcd", valid: "abc1", error: "passwordNumber" },
    { key: "requireSpecial", invalid: "abc ", valid: "abc!", error: "passwordSpecial" },
  ] as const;
  for (const example of examples) {
    const policy = { ...defaultPasswordPolicy, minLength: 4, [example.key]: true };
    assert.equal(passwordPolicyError(example.invalid, policy), example.error);
    assert.equal(passwordPolicyError(example.valid, policy), undefined);
    assert.equal(passwordPolicyError(example.invalid, { ...policy, [example.key]: false }), undefined);
  }
  const strict = { ...defaultPasswordPolicy, minLength: 4 };
  for (const rule of passwordCharacterRules) strict[rule.key] = true;
  assert.equal(passwordPolicyError("Aa1!", strict), undefined);
  assert.equal(passwordPolicyError("Äö1€", strict), undefined);
  assert.equal(passwordPolicyError("Aa1\n", strict), "passwordSpecial");
  assert.equal(passwordPolicyError("Aa1\u0000", strict), "passwordSpecial");
});
