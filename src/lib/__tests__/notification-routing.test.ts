// Regression tests for the notification routing OVERLAY. Two properties matter:
// an admin can silence an event, and an admin can re-address a role broadcast, // but nothing an admin does may strip a personally-targeted recipient or
// accidentally empty the default audience.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NOTIFY_EVENTS, applyRouting, type RoutingMap } from "@/lib/notifications/routing";
import {
  ROLES,
  BREAKDOWN_NOTIFY_ROLES,
  MAINTENANCE_ESCALATION_ROLES,
  COMPLIANCE_ESCALATION_ROLES,
} from "@/lib/roles";

const DEFAULT_ROLES = ["MAINTENANCE_MANAGER", "FOREMAN", "HSE"];

test("no override for the event is a pass-through", () => {
  assert.deepEqual(applyRouting({}, "BREAKDOWN", DEFAULT_ROLES, ["u1"]), {
    roles: DEFAULT_ROLES,
    userIds: ["u1"],
  });
});

test("an override for a different event does not touch this one", () => {
  const routing: RoutingMap = { ESCALATION: { enabled: false, roles: null } };
  assert.deepEqual(applyRouting(routing, "BREAKDOWN", DEFAULT_ROLES, ["u1"]), {
    roles: DEFAULT_ROLES,
    userIds: ["u1"],
  });
});

test("enabled:false silences the event entirely, recipients and all", () => {
  const routing: RoutingMap = { BREAKDOWN: { enabled: false, roles: ["COO"] } };
  assert.equal(applyRouting(routing, "BREAKDOWN", DEFAULT_ROLES, ["u1"]), null);
  assert.equal(applyRouting(routing, "BREAKDOWN", undefined, ["u1"]), null);
  assert.equal(applyRouting(routing, "BREAKDOWN", DEFAULT_ROLES, undefined), null);
});

test("enabled:true with no role override passes the code default through", () => {
  const routing: RoutingMap = { BREAKDOWN: { enabled: true, roles: null } };
  assert.deepEqual(applyRouting(routing, "BREAKDOWN", DEFAULT_ROLES, ["u1"]), {
    roles: DEFAULT_ROLES,
    userIds: ["u1"],
  });
});

test("a role override replaces the default audience on a role-targeted send", () => {
  const routing: RoutingMap = { BREAKDOWN: { enabled: true, roles: ["COO", "FACTORY_MANAGER"] } };
  const out = applyRouting(routing, "BREAKDOWN", DEFAULT_ROLES, undefined);
  assert.deepEqual(out, { roles: ["COO", "FACTORY_MANAGER"], userIds: undefined });
});

test("a role override never re-addresses a personally-targeted send", () => {
  // GENERAL is a personal event: an assignment goes to the assignee, and no
  // admin setting may redirect it to a role broadcast.
  const routing: RoutingMap = { GENERAL: { enabled: true, roles: ["COO"] } };
  assert.deepEqual(applyRouting(routing, "GENERAL", undefined, ["assignee-1"]), {
    roles: undefined,
    userIds: ["assignee-1"],
  });
  assert.deepEqual(applyRouting(routing, "GENERAL", [], ["assignee-1"]), {
    roles: [],
    userIds: ["assignee-1"],
  });
});

test("an empty roles override does not wipe the default audience", () => {
  // Saving the settings form with every chip cleared must not silently make an
  // enabled event reach nobody, silencing is done with the enabled toggle.
  const routing: RoutingMap = { BREAKDOWN: { enabled: true, roles: [] } };
  assert.deepEqual(applyRouting(routing, "BREAKDOWN", DEFAULT_ROLES, undefined), {
    roles: DEFAULT_ROLES,
    userIds: undefined,
  });
});

test("explicit user recipients survive every enabled branch", () => {
  const userIds = ["u1", "u2"];
  const overrides: RoutingMap[] = [
    {},
    { BREAKDOWN: { enabled: true, roles: null } },
    { BREAKDOWN: { enabled: true, roles: [] } },
    { BREAKDOWN: { enabled: true, roles: ["COO"] } },
  ];
  for (const routing of overrides) {
    const out = applyRouting(routing, "BREAKDOWN", DEFAULT_ROLES, userIds);
    assert.deepEqual(out?.userIds, userIds, `userIds lost for ${JSON.stringify(routing)}`);
  }
});

test("the override does not mutate the caller's role array", () => {
  const roles = [...DEFAULT_ROLES];
  const routing: RoutingMap = { BREAKDOWN: { enabled: true, roles: ["COO"] } };
  applyRouting(routing, "BREAKDOWN", roles, undefined);
  assert.deepEqual(roles, DEFAULT_ROLES);
});

test("a send with neither roles nor userIds stays empty rather than inheriting the override", () => {
  const routing: RoutingMap = { BREAKDOWN: { enabled: true, roles: ["COO"] } };
  assert.deepEqual(applyRouting(routing, "BREAKDOWN", undefined, undefined), {
    roles: undefined,
    userIds: undefined,
  });
});

test("every catalogue event can be silenced and every personal one keeps its recipient", () => {
  for (const e of NOTIFY_EVENTS) {
    const off: RoutingMap = { [e.event]: { enabled: false, roles: null } };
    assert.equal(applyRouting(off, e.event, e.defaultRoles ?? undefined, ["u1"]), null, `${e.event} could not be silenced`);

    if (e.personal) {
      const redirect: RoutingMap = { [e.event]: { enabled: true, roles: ["COO"] } };
      const out = applyRouting(redirect, e.event, undefined, ["u1"]);
      assert.deepEqual(out?.userIds, ["u1"], `${e.event} lost its personal recipient`);
      assert.equal(out?.roles, undefined, `${e.event} was turned into a role broadcast`);
    }
  }
});

test("the catalogue is well formed, unique events, labelled, personal flags set", () => {
  const events = NOTIFY_EVENTS.map((e) => e.event);
  assert.equal(new Set(events).size, events.length, "duplicate event key in the catalogue");
  for (const e of NOTIFY_EVENTS) {
    assert.ok(e.label.trim().length > 0, `${e.event} has no label`);
    assert.ok(e.desc.trim().length > 0, `${e.event} has no description`);
    assert.equal(typeof e.personal, "boolean");
    // Documented defaults are documentation only, but they must at least be a
    // role list or explicitly null, never an empty array pretending to be one.
    assert.ok(e.defaultRoles === null || e.defaultRoles.length > 0, `${e.event} documents an empty audience`);
  }
});

// ── Audience canonicality ────────────────────────────────────────────────────
// The audiences were five hardcoded arrays at the dispatch sites plus a sixth
// copy in the Settings catalogue used only for display. Nothing compared them,
// so the roles an admin saw on screen could differ from the roles that actually
// received the message, and the drift would be invisible from both ends.
test("the Settings catalogue shows the audience that actually dispatches", () => {
  const breakdown = NOTIFY_EVENTS.find((e) => e.event === "BREAKDOWN");
  assert.deepEqual(
    breakdown?.defaultRoles,
    BREAKDOWN_NOTIFY_ROLES,
    "the chips shown for Breakdown must be the same list corrective/route.ts sends to",
  );
});

// At LIMSL the Super Admin account is held by the lead maintenance supervisor
// and engineer. The system already lets that person sign any step in any chain;
// being able to act on everything while being told about nothing was the
// contradiction.
test("the Super Admin is an operational recipient, not only an administrator", () => {
  assert.ok(
    BREAKDOWN_NOTIFY_ROLES.includes("SUPER_ADMIN"),
    "a machine going down must reach the maintenance lead",
  );
  assert.ok(MAINTENANCE_ESCALATION_ROLES.includes("SUPER_ADMIN"));
  assert.ok(COMPLIANCE_ESCALATION_ROLES.includes("SUPER_ADMIN"));
});

test("every notification audience contains only canonical roles, without repeats", () => {
  for (const [name, list] of [
    ["BREAKDOWN_NOTIFY_ROLES", BREAKDOWN_NOTIFY_ROLES],
    ["MAINTENANCE_ESCALATION_ROLES", MAINTENANCE_ESCALATION_ROLES],
    ["COMPLIANCE_ESCALATION_ROLES", COMPLIANCE_ESCALATION_ROLES],
  ] as const) {
    for (const r of list) {
      assert.ok((ROLES as readonly string[]).includes(r), `${name} contains "${r}", which is not a role`);
    }
    assert.equal(new Set(list).size, list.length, `${name} repeats a role`);
  }
});
