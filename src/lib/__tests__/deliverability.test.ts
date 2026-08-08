import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyMailHost,
  domainOf,
  isConsumerDomain,
  MAIL_HOST_LABELS,
} from "@/lib/notifications/deliverability";

test("a Microsoft 365 tenant is recognised from its MX", () => {
  // The real MX for the domain that prompted this: leemachinery.net.
  assert.equal(classifyMailHost(["leemachinery-net.mail.protection.outlook.com"]), "MICROSOFT_365");
});

test("the other common hosts are recognised", () => {
  assert.equal(classifyMailHost(["aspmx.l.google.com", "alt1.aspmx.l.google.com"]), "GOOGLE_WORKSPACE");
  assert.equal(classifyMailHost(["mx.zoho.com"]), "ZOHO");
  assert.equal(classifyMailHost(["mx0a-000abc01.pphosted.com"]), "PROOFPOINT");
  assert.equal(classifyMailHost(["eu-smtp-inbound-1.mimecast.com"]), "MIMECAST");
  assert.equal(classifyMailHost(["mail.someselfhosted.example"]), "OTHER");
});

// No MX means no mail server. Nothing the app does can deliver there, so this
// must be distinguishable from "delivered but filtered".
test("a domain with no MX is NONE, not OTHER", () => {
  assert.equal(classifyMailHost([]), "NONE");
});

test("every host classification has a human label", () => {
  for (const host of ["MICROSOFT_365", "GOOGLE_WORKSPACE", "ZOHO", "PROOFPOINT", "MIMECAST", "OTHER", "NONE"] as const) {
    assert.ok(MAIL_HOST_LABELS[host]?.length > 0, `${host} has no label`);
  }
});

test("consumer mailboxes are identified — this is what triggers the warning", () => {
  assert.equal(isConsumerDomain("automation.io.u.123@gmail.com"), true);
  assert.equal(isConsumerDomain("someone@outlook.com"), true);
  assert.equal(isConsumerDomain("didonor@leemachinery.net"), false);
  assert.equal(isConsumerDomain("not-an-address"), false);
});

test("domainOf is case-insensitive and tolerates junk", () => {
  assert.equal(domainOf("Didonor@LeeMachinery.NET"), "leemachinery.net");
  assert.equal(domainOf("no-at-sign"), "");
  assert.equal(domainOf(""), "");
});
