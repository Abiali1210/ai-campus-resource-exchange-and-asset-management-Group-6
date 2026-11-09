// Pure synthetic-account mapping shared by both seed commands. No Auth/network writes.
const aliasByFixture = new Map([
  ["active|requester|Engineering", "req-eng"],
  ["active|requester|Science", "req-sci"],
  ["active|representative|Engineering", "rep-eng"],
  ["active|representative|Science", "rep-sci"],
  ["active|business_administrator|Engineering", "biz-eng"],
  ["active|maintenance|Engineering", "maint"],
  ["active|facilities|Engineering", "fac"],
  ["active|procurement|Engineering", "proc"],
  ["active|finance|Engineering", "fin"],
  ["active|sustainability|Engineering", "sust"],
  ["active|system_administrator|Engineering", "admin"],
  ["inactive|requester|Engineering", "inactive"],
]);

export function demoEmailFor(profile, departments) {
  if (
    typeof profile.active !== "boolean" ||
    !Array.isArray(profile.roles) ||
    profile.roles.length !== 1
  )
    throw new Error(
      `Unsupported synthetic account mapping for ${profile.userId}.`,
    );
  const department = departments.find(
    (d) => d.departmentId === profile.departmentId,
  );
  if (!department)
    throw new Error(
      `Unknown synthetic account department for ${profile.userId}.`,
    );
  const state = profile.active ? "active" : "inactive";
  const local = aliasByFixture.get(
    `${state}|${profile.roles[0]}|${department.name}`,
  );
  if (!local)
    throw new Error(
      `Unsupported synthetic account mapping for ${profile.userId}.`,
    );
  return `${local}@demo.test`;
}

// Existing accounts can be renamed by the explicit provisioner without replacing IDs/passwords.
export const legacyDemoEmailFor = (profile) =>
  `${profile.name
    .replace(/^Synthetic /, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}@demo.example.test`;
