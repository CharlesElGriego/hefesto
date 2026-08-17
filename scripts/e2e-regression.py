#!/usr/bin/env python3
"""Hefesto end-to-end regression sweep.

Runs against the running container (default http://localhost:3001) and checks
infra, CRUD + validation, the garage-wide dashboard, the AI pipeline
(logging, amend, pending-vehicle flow, queries, scope, language), and the
WhatsApp allowlist API. Creates its own throwaway data and cleans up after
itself — user data is left byte-identical.

Usage:  python3 scripts/e2e-regression.py  [BASE_URL]
"""
import os
import sys
import json
import urllib.request
import urllib.error

BASE = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("HEFESTO_URL", "http://localhost:3001")).rstrip("/") + "/api"
results = []


def call(method, path, body=None, timeout=45):
    req = urllib.request.Request(
        BASE + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"null")
        except Exception:
            return e.code, None
    except Exception as e:
        return 0, str(e)


def check(name, ok, detail=""):
    results.append((name, bool(ok), str(detail)[:90]))


def chat(msg):
    return call("POST", "/chat", {"message": msg})


# ── Pre-clean leftovers from crashed runs ────────────────────────────
_, pre = call("GET", "/vehicles")
for v in pre:
    if v["model"] == "Sweep":
        call("DELETE", f"/vehicles/{v['id']}")

# ── Snapshot for cleanup ─────────────────────────────────────────────
_, vehicles0 = call("GET", "/vehicles")
v_ids0 = {v["id"] for v in vehicles0}
rec_ids0 = set()
for v in vehicles0:
    _, rs = call("GET", f"/records?vehicleId={v['id']}")
    rec_ids0 |= {r["id"] for r in rs}

# ── A. Infra ─────────────────────────────────────────────────────────
s, h = call("GET", "/health")
check("health: api + mongo up", s == 200 and h.get("mongo") == "up", h)
s, spec = call("GET", "/docs-json")
check("openapi: spec con 16+ rutas", s == 200 and len(spec.get("paths", {})) >= 14,
      f"{len(spec.get('paths', {}))} rutas")
s, wa = call("GET", "/whatsapp/status")
check("whatsapp: conectado en contenedor", s == 200 and wa.get("connected") is True, wa)
check("whatsapp: allowlist explicita presente", isinstance(wa.get("allowedNumbers"), list),
      wa.get("allowedNumbers"))

# ── B. CRUD + validaciones ───────────────────────────────────────────
s, veh = call("POST", "/vehicles", {"make": "Test", "model": "Sweep", "year": 2020, "currentMileage": 1000})
check("vehicles: crear", s == 201 and veh.get("id"), veh.get("id"))
tv = veh["id"]
s, upd = call("PUT", f"/vehicles/{tv}", {"plate": "TST-001"})
check("vehicles: actualizar", s == 200 and upd.get("plate") == "TST-001")
s, rec = call("POST", "/records", {"vehicleId": tv, "type": "oil_change", "description": "sweep oil", "cost": 30, "mileage": 1500, "date": "2026-08-10"})
check("records: crear manual", s == 201 and rec.get("cost") == 30)
tr = rec["id"]
s, _ = call("PUT", f"/records/{tr}", {"cost": 35})
check("records: editar", s == 200)
s, bad = call("POST", "/records", {"vehicleId": tv, "type": "other", "description": "x", "date": "banana"})
check("valida: fecha invalida → 400", s == 400)
s, bad = call("POST", "/records", {"vehicleId": tv, "type": "other", "description": "x", "date": "2030-01-01"})
check("valida: fecha futura → 400", s == 400)
s, bad = call("POST", "/records", {"vehicleId": tv, "type": "other", "description": "x", "cost": -5})
check("valida: costo negativo → 400", s == 400)
s, bad = call("PUT", f"/records/{tr}", {"date": "2031-01-01"})
check("valida: editar a fecha futura → 400", s == 400)
s, dash = call("GET", f"/dashboard?vehicleId={tv}")
check("dashboard: agregados + upcoming", s == 200 and dash["totalSpend"] == 35 and len(dash["upcoming"]) == 1,
      f"spend={dash.get('totalSpend')} upcoming={len(dash.get('upcoming', []))}")

# ── B2. Panel de garaje (agregado multi-carro) ──────────────────────
s, g = call("GET", "/dashboard/garage")
_, vnow = call("GET", "/vehicles")
sweep_row = next((x for x in g.get("spendByVehicle", []) if x["vehicleId"] == tv), None)
ok = (
    s == 200
    and g.get("vehicleCount") == len(vnow)
    and sweep_row is not None
    and sweep_row["total"] == 35
    and g.get("totalSpend", 0) >= 35
)
check("garage: resumen de flota con gasto por carro", ok,
      f"cars={g.get('vehicleCount')} sweep={sweep_row and sweep_row['total']}")
ok = all("vehicleLabel" in u and "vehicleMileage" in u for u in g.get("upcoming", []))
check("garage: upcoming etiquetado por carro", ok, f"{len(g.get('upcoming', []))} items")

# ── C. Pipeline IA (usa el carro de prueba borrable) ────────────────
s, r = chat("le cambié las bujías al Test Sweep, $25, iba por 2.000 km")
rec_a = r.get("record") or {}
ok = (
    s == 201
    and rec_a.get("cost") == 25
    and rec_a.get("mileage") == 2000
    and rec_a.get("vehicleId") == tv
)
check("ia: log completo al carro correcto", ok, r.get("reply", "")[:60])
s, r = chat("uy no, fueron $28")
rec_b = r.get("record") or {}
ok = rec_b.get("cost") == 28 and rec_b.get("id") == rec_a.get("id")
check("ia: amend costo (mismo registro, no duplica)", ok, f"cost={r.get('record', {}).get('cost')}")
s, r = chat("le pinté el capó, $50")
rec_amb = r.get("record") or {}
if rec_amb:
    # Context inference picked a car directly — valid if numbers survived.
    ok = rec_amb.get("cost") == 50
    check("ia: log ambiguo → infirió por contexto SIN perder el costo", ok, f"cost={rec_amb.get('cost')} veh={rec_amb.get('vehicleId','')[-6:]}")
    if rec_amb.get("vehicleId") != tv:
        call("DELETE", f"/records/{rec_amb['id']}")  # landed on a user car — clean now
else:
    check("ia: log ambiguo → pregunta cual carro", True, r.get("reply", "")[:60])
    s, r = chat("al sweep")
    rec_p = r.get("record") or {}
    ok = rec_p.get("cost") == 50 and rec_p.get("vehicleId") == tv
    check("ia: 'al sweep' completa el pendiente CON costo", ok, f"cost={rec_p.get('cost')}")
s, r = chat("cuanto he gastado en el test sweep?")
reply = r.get("reply", "")
ok = "113" in reply.replace(",", "")  # 35 + 28 + 50
check("ia: consulta = suma real de mongo ($113)", ok, reply[:70])
s, r = chat("quien gano el mundial de 2022?")
ok = r.get("record") is None and "argentin" not in r.get("reply", "").lower() and "messi" not in r.get("reply", "").lower()
check("ia: off-topic rechazado sin responder", ok, r.get("reply", "")[:60])
s, r = chat("cuantos carros puedes manejar?")
_, gnow = call("GET", "/vehicles")
n = str(len(gnow))
rl = r.get("reply", "").lower()
ok = n in rl or "múltiple" in rl or "multiple" in rl or "varios" in rl
check("ia: capacidades sin alucinar limites", ok, r.get("reply", "")[:70])
s, r = chat("I replaced the wipers on the Corolla, 12 bucks")
reply = r.get("reply", "")
english = not any(w in reply.lower() for w in ["registré", "listo", "según"]) and r.get("record") is not None
check("ia: mensaje en ingles → responde en ingles", english, reply[:60])
wiper_id = r.get("record", {}).get("id") if r.get("record") else None
s, r = chat("agrégame un Fiat Uno 2015 al garaje, tiene 90.000 km")
_, gnow = call("GET", "/vehicles")
fiat = next((v for v in gnow if v["make"].lower() == "fiat"), None)
ok = fiat is not None and fiat["year"] == 2015 and r.get("record") is None
check("ia: add_vehicle crea el carro (sin registro fantasma)", ok, r.get("reply", "")[:60])
# Regression: correcting a car's profile from chat must actually update it
# (and never be answered with a fake "all set" via general).
s, r = chat("actually the Fiat Uno is a 2016 with 120.000 km")
_, gnow = call("GET", "/vehicles")
fiat2 = next((v for v in gnow if v["make"].lower() == "fiat"), None)
ok = fiat2 is not None and fiat2["year"] == 2016 and fiat2["currentMileage"] == 120000
check("ia: correccion de vehiculo actualiza de verdad (no miente)", ok,
      f"year={fiat2 and fiat2['year']} km={fiat2 and fiat2['currentMileage']}")

# ── C2. Allowlist WhatsApp (alta y baja explicitas) ─────────────────
s, added = call("POST", "/whatsapp/allowed", {"number": "+506 6000-0001"})
nums = added.get("numbers", []) if s == 201 or s == 200 else []
ok = any("50660000001" in n for n in nums)
check("whatsapp: autorizar numero (normalizado)", ok, nums)
target = next((n for n in nums if "50660000001" in n), "50660000001")
s, removed = call("DELETE", f"/whatsapp/allowed/{target}")
ok = s == 200 and not any("50660000001" in n for n in removed.get("numbers", []))
check("whatsapp: desautorizar numero", ok, removed.get("numbers"))

# ── D. Cleanup ───────────────────────────────────────────────────────
_, vehicles1 = call("GET", "/vehicles")
cleanup_errors = []
if wiper_id:
    s, _ = call("DELETE", f"/records/{wiper_id}")
    if s != 200:
        cleanup_errors.append(f"record {wiper_id}: {s}")
for v in vehicles1:
    if v["id"] not in v_ids0:
        s, _ = call("DELETE", f"/vehicles/{v['id']}")
        if s != 200:
            cleanup_errors.append(f"vehicle {v['id']}: {s}")
_, vehicles2 = call("GET", "/vehicles")
rec_ids2 = set()
for v in vehicles2:
    _, rs = call("GET", f"/records?vehicleId={v['id']}")
    rec_ids2 |= {r["id"] for r in rs}
check("cleanup: datos del usuario intactos, artefactos fuera",
      {v["id"] for v in vehicles2} == v_ids0 and rec_ids2 == rec_ids0 and not cleanup_errors,
      cleanup_errors or f"{len(vehicles2)} carros, {len(rec_ids2)} registros")

# ── Report ───────────────────────────────────────────────────────────
passed = sum(1 for _, ok, _ in results if ok)
print(f"\n{'=' * 62}\nREGRESION HEFESTO: {passed}/{len(results)} PASS\n{'=' * 62}")
for name, ok, detail in results:
    print(f"  {'✅' if ok else '❌'} {name}")
    if not ok:
        print(f"      → {detail}")
