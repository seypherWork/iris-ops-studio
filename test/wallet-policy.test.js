import test from "node:test";
import assert from "node:assert/strict";
import { walletEditable, walletSnapshot, buildWalletPolicyMutation } from "../web/assets/wallet-policy.js";
import { evaluatePrecondition, evaluateVerification } from "../web/assets/operations.js";

const name = "IrisOps_TestWallet";
const initial = () => ({ result: { EditResource: "IrisOps_TestEdit:W", UseResource: "IrisOps_TestUse:R" } });

test("wallet policy changes only documented metadata and compares both fields", () => {
  const before = initial();
  const plan = buildWalletPolicyMutation(before, name, "IrisOps_TestEdit:WRITE", "IrisOps_TestAlternate:READ");
  assert.deepEqual(Object.keys(plan.body), ["EditResource", "UseResource"]);
  assert.equal(plan.changed, true);
  assert.equal(evaluatePrecondition(plan.precondition, before).status, "current");
  assert.equal(evaluateVerification(plan.verification, { result: plan.body }).status, "verified");
  assert.equal(evaluateVerification(plan.verification, { ...plan.body, EditResource: "IrisOps_Other:WRITE" }).status, "mismatch");
  assert.equal(evaluatePrecondition(plan.precondition, plan.body).status, "stale");
  assert.equal(before.result.UseResource, "IrisOps_TestUse:R");
});

test("wallet resource defaults and case compare semantically", () => {
  const plan = buildWalletPolicyMutation(initial(), name, "irisops_testedit", "IRISOPS_TESTUSE:READ");
  assert.equal(plan.changed, false);
  assert.equal(walletSnapshot(initial(), name).EditResource, "IRISOPS_TESTEDIT:WRITE");
});

test("wallet rejects malformed, missing, redacted and undocumented metadata", () => {
  for (const value of [null, [], {}, { EditResource: "x" }, { ...initial().result, Name: "other" },
    { ...initial().result, Secret: "synthetic" }, { ...initial().result, editresource: "x" },
    { ...initial().result, UseResource: "[REDACTED]" }, { ...initial().result, EditResource: 1 }]) {
    assert.throws(() => walletSnapshot(value, name));
  }
});

test("wallet declines system names, wildcard access and invalid permission expressions", () => {
  for (const value of ["%System", "_System", "../other", "", "a\n", "name ", "name.other", "name other", "a".repeat(65)]) assert.equal(walletEditable(value), false);
  for (const value of ["", "*", "resource:*", "resource:RW", "resource:DELETE", "resource:R,other:W", "a".repeat(65), "a".repeat(59) + ":W"]) {
    assert.throws(() => buildWalletPolicyMutation(initial(), name, value, "IrisOps_TestUse:R"));
  }
});

test("wallet invalid or unauthorized readback is never called verified", () => {
  const plan = buildWalletPolicyMutation(initial(), name, "IrisOps_TestEdit:W", "IrisOps_TestAlternate:R");
  assert.equal(evaluateVerification(plan.verification, null, { status: 403 }).status, "error");
  assert.equal(evaluateVerification(plan.verification, { result: {} }).status, "mismatch");
  assert.equal(evaluatePrecondition(plan.precondition, {}).status, "invalid");
});
