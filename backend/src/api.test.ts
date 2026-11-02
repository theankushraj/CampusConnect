import assert from "node:assert/strict";
import test from "node:test";

test("health payload shape", () => {
  const body = { status: "ok", service: "campusconnect-api" };
  assert.equal(body.status, "ok");
});
