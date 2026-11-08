"""Validate synthetic domain data, not application authorization or runtime behavior."""

import json
from collections import Counter
from pathlib import Path
from uuid import UUID

ROOT = Path(__file__).resolve().parents[1]
data = json.loads((ROOT / "tests/fixtures/foundation.json").read_text(encoding="utf-8"))
cases = json.loads((ROOT / "tests/fixtures/foundation-acceptance.json").read_text(encoding="utf-8"))


def require(condition, message):
    if not condition:
        raise ValueError(message)


def keyed(table, field):
    rows = data[table]
    result = {row[field]: row for row in rows}
    require(len(result) == len(rows), f"Duplicate identifiers in {table}")
    for identifier in result:
        UUID(identifier)
    return result


departments = keyed("departments", "departmentId")
users = keyed("users", "userId")
categories = keyed("categories", "categoryId")
assets = keyed("assets", "assetId")
portions = keyed("stockPortions", "portionId")
require(len(set(data["roles"])) == 9, "Expected nine unique human role classes")
for user in users.values():
    require(user["departmentId"] in departments, "Unknown profile department")
    require(set(user["roles"]) <= set(data["roles"]), "Unknown role assignment")
    require(len(user["roles"]) == len(set(user["roles"])), "Duplicate role assignment")
require(set(data["roles"]) == {role for u in users.values() for role in u["roles"]}, "Unrepresented role")

totals = Counter()
for portion in portions.values():
    require(portion["assetId"] in assets, "Unknown portion asset")
    require(type(portion["qty"]) is int and portion["qty"] > 0, "Invalid portion quantity")
    require(portion["ownerDepartmentId"] in departments, "Unknown owning department")
    custodian = users.get(portion["custodianId"])
    require(custodian is not None, "Unknown custodian")
    require("representative" in custodian["roles"], "Custodian lacks representative role")
    require(custodian["departmentId"] == portion["ownerDepartmentId"], "Custodian department mismatch")
    require(portion["parentPortionId"] is None, "Starting fixture should have unsplit stock")
    if portion["active"]:
        totals[portion["assetId"]] += portion["qty"]
    require(portion["published"] == (portion["state"] == "Available"), "Inconsistent seed publication state")

for asset in assets.values():
    require(asset["categoryId"] in categories, "Unknown category")
    require(asset["trackingMode"] in {"individual", "batch"}, "Invalid tracking mode")
    require(type(asset["totalQty"]) is int and asset["totalQty"] > 0, "Invalid total quantity")
    require(totals[asset["assetId"]] == asset["totalQty"], "Stock conservation failure")
    if asset["trackingMode"] == "individual":
        require(asset["totalQty"] == 1, "Individual asset quantity must be one")

require(any(p["condition"] == "Unknown" and p["state"] == "Available" for p in portions.values()), "Missing unknown-condition listing")
require(any(p["state"] == "Unfit" for p in portions.values()), "Missing unsafe case")
require(any(p["state"] == "Retired" for p in portions.values()), "Missing retired case")
require(any(not u["active"] for u in users.values()), "Missing inactive account case")
require(len({c["id"] for c in cases["cases"]}) == len(cases["cases"]), "Duplicate acceptance case ID")
require(all(c["requirement"] and c["expected"] for c in cases["cases"]), "Incomplete acceptance case")
print(f"PASS: {len(departments)} departments, {len(users)} synthetic profiles, {len(assets)} assets, nine roles, conserved stock and {len(cases['cases'])} planned cases.")
print("Scope: fixture integrity only. No application, database, provider or permission tests were run.")
