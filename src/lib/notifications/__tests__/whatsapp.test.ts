// src/lib/notifications/__tests__/whatsapp.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { toMsisdn, sendWhatsApp } from "../whatsapp";
import { config, whatsappReady } from "@/lib/config";

test("toMsisdn normalizes local and international phone numbers", () => {
  // Nigerian 11-digit local format starting with 0
  assert.equal(toMsisdn("09167653581"), "2349167653581");
  assert.equal(toMsisdn("08031234567"), "2348031234567");

  // International format with '+'
  assert.equal(toMsisdn("+2349167653581"), "2349167653581");

  // Formatted with spaces and hyphens
  assert.equal(toMsisdn("+234 (916) 765-3581"), "2349167653581");

  // Already normalized digits
  assert.equal(toMsisdn("2349167653581"), "2349167653581");
});

test("whatsappReady validates OpenWA gateway configuration", () => {
  const origEnabled = config.whatsappEnabled;
  const origProvider = config.whatsappProvider;
  const origUrl = config.openwaBaseUrl;

  try {
    config.whatsappEnabled = true;
    config.whatsappProvider = "OPENWA";
    config.openwaBaseUrl = "http://localhost:3000";
    assert.equal(whatsappReady().ready, true);

    config.openwaBaseUrl = "";
    assert.equal(whatsappReady().ready, false);

    config.whatsappEnabled = false;
    assert.equal(whatsappReady().ready, false);
  } finally {
    config.whatsappEnabled = origEnabled;
    config.whatsappProvider = origProvider;
    config.openwaBaseUrl = origUrl;
  }
});

test("sendWhatsApp dispatches formatted payload to OpenWA REST endpoint", async () => {
  const origFetch = globalThis.fetch;
  const origProvider = config.whatsappProvider;
  const origUrl = config.openwaBaseUrl;
  const origSession = config.openwaSessionId;
  const origKey = config.openwaApiKey;

  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};
  let capturedBody: any = null;

  try {
    config.whatsappProvider = "OPENWA";
    config.openwaBaseUrl = "http://127.0.0.1:3000";
    config.openwaSessionId = "dispatch-main";
    config.openwaApiKey = "test-openwa-secret";

    globalThis.fetch = async (input: any, init?: any) => {
      capturedUrl = String(input);
      capturedHeaders = init?.headers || {};
      capturedBody = JSON.parse(init?.body || "{}");

      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "msg-123456", status: "success" }),
      } as any;
    };

    const res = await sendWhatsApp("09167653581", "Urgent: Gas check complete on LEE/PE/1904");

    assert.equal(res.ok, true);
    assert.equal(res.messageId, "msg-123456");
    assert.equal(capturedUrl, "http://127.0.0.1:3000/api/sessions/dispatch-main/messages/send-text");
    assert.equal(capturedHeaders["X-API-Key"], "test-openwa-secret");
    assert.equal(capturedBody.chatId, "2349167653581@c.us");
    assert.equal(capturedBody.text, "Urgent: Gas check complete on LEE/PE/1904");
  } finally {
    globalThis.fetch = origFetch;
    config.whatsappProvider = origProvider;
    config.openwaBaseUrl = origUrl;
    config.openwaSessionId = origSession;
    config.openwaApiKey = origKey;
  }
});
