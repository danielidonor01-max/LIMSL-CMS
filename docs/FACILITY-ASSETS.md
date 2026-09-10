# Office AC units and calibrated instruments

Where the data came from, how to load it, and the five things on it that nobody
could settle from paper.

## What was loaded

| | Count | Series |
|---|---|---|
| Split AC units | 19 | `LEE/OE/####` |
| Calibrated instruments | 4 | `LEE/PE/####`, assigned at load |

Transcribed from two LIMSL spreadsheets: the AC servicing schedule (floor
grouping, serviced and next-service dates) and the *LIMSL AC LIST* (brand,
model, power rating). The instruments are rows 54 to 57 of the LIMS maintenance
log.

The data lives in `src/lib/facility-assets.ts` and is checked by
`facility-assets.test.ts`, which proof-reads the transcription against the
redundancy in the source: the printed per-floor totals, and the fact that all 19
units share one 120-day service interval. A dropped row or a slipped date breaks
one of those relationships.

## A third asset series

The AC units are tagged `LEE/OE/####` and those labels are already on the units,
so the register carries them rather than renumbering into `PE` or `SYS`. `OE` is
now a first-class prefix in `src/lib/asset-id.ts` alongside them, and the Asset
Register has a matching filter tab. Before this, an unrecognised prefix was
silently filed under `PE`, which would have reported 19 air conditioners as
production machines.

## Loading it

```bash
DATABASE_URL=postgresql://...:6543/postgres npx tsx src/lib/db/seed-facility-assets.ts
```

It upserts and never deletes, so it is safe to re-run. It also leaves `status`
and `criticality` alone on rows that already exist, so a unit a technician has
marked `BROKEN_DOWN` is not reset by someone re-running the load.

**`seed-oem-calibration.ts` deletes the whole calibration table before writing.**
Running it after this one removes these four instruments' calibration records.
Re-run this seed to put them back.

## What still needs a person

Five things where the two sheets contradict each other or contradict
themselves. Each is written into the asset's notes, and the seed prints this
list when it finishes. All of them need somebody to read the label on the
equipment.

1. **`LEE/OE/2178` and `LEE/OE/2179`** — the sheets swap these two tags between
   the Workshop Supervisor and Factory Manager offices. The serial numbers agree
   across both sheets, so the serials are trustworthy and the tags are not. The
   servicing schedule's version was loaded.
2. **`LEE/OE/1840` (Class Room)** — the AC LIST calls it `LEE/PE/1840`. `PE` is
   the production-machine series, so `OE` was taken as correct.
3. **`LEE/OE/2233` and `LEE/OE/2234` (Conference Room)** — both units are
   recorded against serial `6946087357733`. Two units cannot share a serial.
4. **Fluke 376 FC and Mastech MS2001** — both instruments are recorded against
   serial `06001052`.
5. **`LEE/OE/1809` (Kitchen, Ground Floor)** — the serial mixes letter `O` and
   digit `0`. Transcribed exactly as printed rather than corrected, because a
   serial is evidence and a silent correction breaks the match to the nameplate.

## Two findings worth acting on

**Every AC unit is overdue.** The last service was late September to early
October 2025 and the next was due late January 2026. Against a 120-day cycle
they are between 221 and 225 days past due.

**The earth resistance tester's calibration expired on 1 March 2025.** Earth
resistance readings taken with it since then are not traceable, which is exactly
what ISO 9001 7.1.5.2 asks about. It loads as `OVERDUE`.

## Fields the source did not carry

- **Criticality** is not in either sheet. Everything loads at the schema default
  rather than being guessed.
- **The service interval is 120 days**, which the schema's frequency list has no
  step for. `QUARTERLY` is stored as the nearest label; the real dates carry the
  truth and are what drive the overdue calculation.
- **Power rating** has no column, so it rides in `subCategory` as
  "1.5HP split unit" / "2HP split unit".
- **Floor** has no column, so it rides in `bay` as "Ground Floor" / "Top Floor".
- **Calibration traceability** (lab name, accreditation body, reference
  standard) is not on the sheet. Left empty rather than invented, so the gap is
  visible where an auditor would look for it.
