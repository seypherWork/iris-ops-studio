// Metadata only: this module never handles wallet secret values.
export function walletEditable(name) {
  return typeof name === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name);
}

export function walletResource(value, defaultPermission) {
  if (typeof value !== "string") throw new TypeError("Wallet resource must be a string");
  const match = value.trim().match(/^(%?[A-Za-z][A-Za-z0-9_.$-]*)(?::(R|READ|W|WRITE|U|USE))?$/i);
  if (!match || match[1].length > 64) throw new TypeError("Use an explicit resource name with READ, WRITE or USE; empty or wildcard access is not supported");
  const permission = { R: "READ", W: "WRITE", U: "USE" }[match[2]?.toUpperCase()] || match[2]?.toUpperCase() || defaultPermission;
  const canonical = `${match[1].toUpperCase()}:${permission}`;
  if (canonical.length > 64) throw new TypeError("Wallet resource:permission must fit the IRIS 64-character field");
  return canonical;
}

export function walletSnapshot(payload, name) {
  if (!walletEditable(name)) throw new TypeError("System or unsupported collection names are inventory-only");
  const value = payload && typeof payload === "object" && "result" in payload ? payload.result : payload;
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => !["Name", "EditResource", "UseResource"].includes(key))
    || value.Name !== undefined && value.Name !== name) {
    throw new TypeError("Wallet metadata is incomplete, undocumented or belongs to a different collection");
  }
  return { EditResource: walletResource(value.EditResource, "WRITE"), UseResource: walletResource(value.UseResource, "READ") };
}

export function buildWalletPolicyMutation(payload, name, editResource, useResource) {
  const before = walletSnapshot(payload, name);
  const body = walletSnapshot({ EditResource: editResource, UseResource: useResource }, name);
  const describe = (policy) => `Edit secrets: ${policy.EditResource}; use secrets: ${policy.UseResource}`;
  return {
    body, changed: JSON.stringify(before) !== JSON.stringify(body),
    beforeSummary: describe(before), expectedSummary: describe(body),
    precondition: { kind: "walletPolicy", name, expected: before },
    verification: { kind: "walletPolicy", name, expected: body, description: "Both collection access-policy fields match the reviewed change" },
  };
}
