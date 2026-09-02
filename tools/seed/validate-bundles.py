#!/usr/bin/env python3
"""Validate generated transaction bundles against FHIR R4(B) resource models
(the structural/cardinality/required-field parse a server runs on ingest) and
check transaction referential integrity (every urn:uuid reference resolves to a
bundle entry; every entry carries request.method + url)."""
import json, sys, glob, os
from fhir.resources import construct_fhir_element

def walk_refs(obj, out):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == "reference" and isinstance(v, str):
                out.append(v)
            else:
                walk_refs(v, out)
    elif isinstance(obj, list):
        for x in obj:
            walk_refs(x, out)

total_res = 0; total_err = 0; files = 0
for path in sorted(glob.glob(os.path.join(sys.argv[1], "*.bundle.json"))):
    files += 1
    b = json.load(open(path))
    name = os.path.basename(path)
    errors = []
    fullurls = set()
    # 1) validate the Bundle wrapper itself
    try:
        construct_fhir_element("Bundle", b)
    except Exception as ex:
        errors.append(("Bundle", str(ex)[:200]))
    # 2) validate each resource + collect fullUrls / requests
    refs = []
    for i, entry in enumerate(b.get("entry", [])):
        if "fullUrl" in entry: fullurls.add(entry["fullUrl"])
        req = entry.get("request", {})
        if not req.get("method") or not req.get("url"):
            errors.append((f"entry[{i}]", "missing request.method/url"))
        res = entry.get("resource", {})
        rt = res.get("resourceType", "?")
        total_res += 1
        try:
            construct_fhir_element(rt, res)
        except Exception as ex:
            errors.append((f"{rt}[{i}]", str(ex).replace("\n", " ")[:220]))
        walk_refs(res, refs)
    # 3) referential integrity: every urn:uuid ref must resolve to a fullUrl
    dangling = sorted({r for r in refs if r.startswith("urn:uuid:") and r not in fullurls})
    for d in dangling:
        errors.append(("ref", f"unresolved intra-bundle reference {d}"))
    status = "OK" if not errors else f"{len(errors)} ISSUE(S)"
    print(f"── {name}: {len(b.get('entry', []))} entries, {len(fullurls)} fullUrls → {status}")
    for where, msg in errors[:20]:
        print(f"     ✗ {where}: {msg}")
    total_err += len(errors)

print(f"\n{files} bundles · {total_res} resources · {total_err} issue(s) total")
sys.exit(1 if total_err else 0)
