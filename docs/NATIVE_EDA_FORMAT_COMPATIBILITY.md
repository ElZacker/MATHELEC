# Native EDA format compatibility

Status: **reference inspection implemented; native project generation is not implemented yet**. This document distinguishes format recognition from actual circuit decoding and export.

## Reference files inspected (31 October 2026)

The repository contains three reference projects under `archivosdeprueba/compatibilidad/`:

| File | Size | Observed structure | What is confirmed |
|---|---:|---|---|
| `Mathelecprueba.lvw` | 1,144 bytes | Binary document beginning with `44 73 67 00` (`Dsg\\0`) | Recognizable New Wave / Livewire-family signature; body remains opaque |
| `Mathelecprueba.pcb` | 1,093 bytes | Binary document beginning with the same `Dsg\\0` signature | Recognizable New Wave / PCB Wizard-family signature; body remains opaque |
| `mathelecprueba.pdsprj` | 12,281 bytes | ZIP container | Contains `PROJECT.XML`, `ROOT.DSN`, `ROOT.CDB` and `SCRIPTS/PWRRAILS.DAT` |

The Livewire and PCB Wizard samples share the first 38 bytes, but the binary content diverges at byte offset 38. Therefore, the signature and common prefix cannot distinguish these two applications; the file extension is the only discriminator currently used by the inspector. The report now states this explicitly through `formatIdentification.selectedBy = "file-extension"` and does not claim an application-specific signature check. Both samples contain the printable strings `page &p of &n` at byte offset 90 and `Arial` at byte offset 104. Mathelect reports these offsets for regression and controlled-diff work; they are document metadata, not decoded circuit objects.

The Proteus file is a ZIP project container. `PROJECT.XML` is text XML, while `ROOT.DSN` and `ROOT.CDB` are binary. A valid ZIP wrapper is not sufficient to create a valid Proteus schematic: the DSN design content still needs a verified decoder/writer.

## Vendor-documented interoperability path

New Wave Concepts documents that PCB Wizard 3 can open a Livewire circuit file and convert it into a PCB layout: https://www.new-wave-concepts.com/ed/pw_faq.html. Mathelect records this as a vendor-documented **Livewire → PCB Wizard** path. This is an application workflow, not a Mathelect-native parser or writer: the application open/convert step has not been smoke-tested by Mathelect, and neither format is advertised as imported or exported by Mathelect.

The compatibility API exposes this path with `vendorDocumented: true` and `applicationSmokeTested: false`; future UI can offer it as a guided external workflow only after the user has PCB Wizard installed.

## Installed application versions confirmed for the current target

The user confirmed these installed application versions on 31 October 2026:

| Format | Target application | Installed version | Is this version read from the file? |
|---|---|---:|---|
| `.lvw` | Livewire | **1.11** | No; user-confirmed installation context |
| `.pcb` | PCB Wizard | **3.50** | No; user-confirmed installation context |
| `.pdsprj` | Proteus | **8.13** | No; user-confirmed installation context |

This distinction is deliberate: the three reference files are not proven to have been saved by these exact installed versions. Mathelect must not silently treat an installed application version as a version stamp embedded in a project.

The version-aware registry lives in `lib/eda/compatibility-matrix.ts`. Every inspection report now returns a `targetApplication` object naming the installed target and stating that the file version was not detected. The read-only endpoint `GET /api/eda/capabilities` exposes the current capability matrix for the UI and future import/export adapters.

### Current capability matrix

| Format / version | Recognition | Container / metadata | Circuit import | Native export | Open / run in target app |
|---|---|---|---|---|---|
| Livewire 1.11 | Signature only | Signature and printable markers only | Not implemented | Not implemented | Not verified |
| PCB Wizard 3.50 | Signature only | Signature and printable markers only | Not implemented | Not implemented | Not verified |
| Proteus 8.13 | Project container recognized | Partial metadata from ROOT.CDB and component references/values from ROOT.DSN | Not implemented | Not implemented | Not verified |

The registry is a version-target baseline, not a claim of native import/export compatibility. The tests enforce that distinction so a future change cannot accidentally advertise a decoder or writer before one exists.

## Next compatibility stage: controlled structural decoding

The next implementation milestone is not a native writer yet. It is to establish verified object-level decoding for the formats, in this order:

1. **Proteus 8.13:** the reader isolates placed records under `OBJECT DATA\\0`, excluding a library/template `COMPONENT ID` marker outside that section. It extracts reference, visible value, the library identifier after `COMPONENT VALUE\\0`, brace-delimited instance properties, and two raw 32-bit words after the reference token. On the repository fixture, B1, D1 and R1 match their ROOT.CDB devices; the raw words are preserved as opaque bytes and are **not** yet interpreted as coordinates. Objects without a normal reference (for example virtual instruments) are retained in an unresolved-object list. Next decode coordinate semantics, symbols, pin identities and wire/net topology.
2. **Livewire 1.11:** identify record boundaries and the serialized component / terminal / wire fields in the New Wave binary stream. A successful signature check is not enough.
3. **PCB Wizard 3.50:** investigate its board-specific records independently, including board outline, footprints, numbered pads, nets and tracks. Do not reuse a Livewire decoder merely because both samples begin with `Dsg\\0`.

A decoder is accepted only when it reproduces the known reference circuit's component count, values, positions, pins and connectivity. Then the reconstructed Mathelect circuit must be compared with what the corresponding desktop application displays. Export remains blocked until the same subset can be written and reopened in the target application.

## Implemented in Mathelect

- `lib/eda/native-project-inspector.ts` recognizes the `.lvw`, `.pcb` and `.pdsprj` file families.
- The New Wave inspector checks the `Dsg\\0` signature and returns only metadata that can be established safely. It deliberately reports that component data is not decoded.
- The Proteus inspector parses the ZIP central directory, rejects unsupported/encrypted/unsafe entries, validates `PROJECT.XML` and verifies extracted entries' sizes and CRC32. In `ROOT.DSN`, it scopes component records to `OBJECT DATA\\0`, recovers the visible value and library identifier across observed binary padding, reads brace-delimited properties, and cross-checks the device identifier against `ROOT.CDB`. The repository fixture's B1, D1 and R1 records all match. Duplicate or missing designators are reported as unresolved objects rather than silently discarded. Two 32-bit words after each designator are preserved in hexadecimal for later placement analysis; their units/meaning remain unknown.
- `POST /api/eda/inspect` accepts a multipart field named `file` (up to 12 MB) and returns the inspection report. The preview panel exposes this through **Inspeccionar archivo nativo**; it does not replace the current Mathelect circuit or claim to import it.
- Proteus ZIP inspection is bounded: at most 256 entries, 16 MB per uncompressed entry, 32 MB total declared uncompressed data and 2 MB for `PROJECT.XML`. Local and central headers are cross-checked, unsafe entry paths are rejected, and extracted XML is size/CRC checked.
- `tests/native-eda-formats.test.ts` uses the three repository samples as regression fixtures. In addition to recognition and container integrity, the Proteus fixture asserts the recovered B1 / D1 / R1 component metadata. These tests do not prove that a generated project opens or simulates in the desktop applications.

This is still **inspection only**. The Proteus reader now recovers three placed, metadata-matched components in the repository sample and preserves special unresolved objects plus raw placement words, but it does not reconstruct usable sheet coordinates, symbol geometry, pin mappings or electrical connections. A second public Proteus project was inspected manually to study a larger object list and virtual instruments; that file is not added to the automated fixtures, so automated regression coverage still relies on the repository's own sample plus synthetic edge-case records. No format has native import or export yet.

## What is still required for real import/export

### Livewire

The binary records must be decoded into component instances, values, positions, terminal/pin identifiers, wires, and simulation properties. Then the writer must emit those records from Mathelect's circuit model. The common `Dsg` signature is not enough to safely build the record stream.

### Proteus

The next decoder must interpret `ROOT.DSN` object coordinates, symbol/library references, pin identities, wire endpoints and nets, and correlate these with the component metadata recovered from `ROOT.CDB`. The current readers are deliberately partial and have only been checked against the single repository fixture; they need more real 8.13 projects before general support can be claimed. A writer must maintain valid internal references and package those records with the expected project metadata. Writing only `PROJECT.XML` or a netlist is not native project generation.

### PCB Wizard

The writer must create a board design with board geometry, actual footprints, numbered pads, net assignments and copper tracks. The sample's binary record structure needs to be decoded independently of Livewire even though their signatures overlap. A schematic-only file, Gerber or NC-Drill export is not an editable PCB Wizard project.

## Exporter architecture

```text
AI proposal
  -> Mathelect Circuit model
  -> structural + electrical validation
  -> target component / pin / footprint mapper
  -> target-specific native writer
  -> format/container validation
  -> application-level open + simulation/routing smoke test
```

Rules:
- Each target has its own writer; do not convert by changing extensions.
- Every mapped component must have an explicit target library identifier and pin mapping.
- Unsupported components, missing footprints, unsupported properties, and unmapped pins must be reported. Never silently drop them.
- A file is not marked supported until it opens in the target software and its component count, values, and net connectivity are checked.
- For Livewire/Proteus, run the circuit in the application's simulator for the supported subset.
- For PCB Wizard, verify pad-to-net connectivity and that every required net is routed or is explicitly reported as unrouted.
- Keep the user's reference projects as fixtures only for the current repository tests; do not present those tests as a substitute for application-level validation.

## Initial research sources

- New Wave Concepts, PCB Wizard FAQ: PCB Wizard 3 can open Livewire circuit files and convert them to PCB layouts: https://www.new-wave-concepts.com/ed/pw_faq.html
- New Wave Concepts, PCB Wizard features: circuit capture, automatic wiring, PCB layout, routing, Gerber and NC-Drill outputs: https://new-wave-concepts.com/ed/pw_feat.html
- Labcenter ISIS User Manual: design files, sections, modules, libraries and netlist export are distinct file types: https://else.fcim.utm.md/pluginfile.php/96458/mod_resource/content/2/EBook%20-%20Proteus%20Manual.pdf
- Proteus project sample analysis: `.pdsprj` ZIP structure and binary `ROOT.DSN`: https://deepwiki.com/codehacked/Pulse-and-Wave-Generator/3.2-schematic-design-data-(root.dsn)

These references establish the initial investigation only. They do not substitute for opening generated files in the exact application versions used by Mathelect users.


## Incremental decoder diagnostics — 31 October 2026

- Livewire 1.11 and PCB Wizard 3.50 reports now include byte offsets for the two confirmed printable document markers. These offsets are tested against each repository fixture (90 for `page &p of &n`, 104 for `Arial`).
- Proteus 8.13 inspection now also attempts to read the length-prefixed library/part identifier that follows the NUL-terminated `COMPONENT VALUE` marker. It reports whether that identifier matches the `device` field from ROOT.CDB as a diagnostic only; a mismatch is not silently rewritten or treated as a fatal decode error.
- This is additional inspection metadata, not component placement, pin, wire, net, footprint-pad or track decoding. Native import/export and application-level tests remain unimplemented.


## Proteus ROOT.DSN object-decoding increment — 31 October 2026

- Placed components are now selected only when their `COMPONENT ID` marker occurs after an `OBJECT DATA` marker. This avoids mistaking a library/template definition elsewhere in the DSN for a component on the sheet.
- For each placed component, the reader extracts the designator, visible value, library identifier following `COMPONENT VALUE` (scanning a bounded window because the marker is followed by binary padding), and all printable brace-delimited instance properties.
- The library identifier is compared with the `device` field from `ROOT.CDB` as a diagnostic; a mismatch is reported, not guessed away.
- Objects that lack a conventional designator, or repeat an already-seen designator, are preserved in `unresolvedObjects`. This matters for virtual instruments and unusual schematic objects.
- Two 32-bit words immediately following the reference token are preserved as hex `rawPlacementWords`. Their semantics and units have not been confirmed; the implementation does not label them coordinates or use them to position components.
- Regression coverage asserts the real fixture's B1/D1/R1 library mappings, per-instance properties and raw words, plus a synthetic case containing a library marker outside `OBJECT DATA`, a component, multiple object-data sections and an unlabelled virtual instrument.
- A separate public Proteus project was inspected manually to compare the marker sequence and special instrument objects. It was not copied into the repository or treated as a passing CI fixture.

The remaining Proteus schematic work is now specifically: identify the raw placement word semantics with controlled saves/moves; resolve symbol/part definitions to pin geometry; decode terminals, wires and net membership; then build a writer and test open + simulation in Proteus 8.13.


## New Wave identification confidence — 31 October 2026

Both repository samples begin with the same four-byte `Dsg\\0` family signature and share their first 38 bytes. The current inspector therefore reports `formatIdentification.selectedBy = "file-extension"` and `applicationSpecificSignatureVerified = false` for both Livewire and PCB Wizard. This prevents the file inspector from implying that the application-specific format has been independently identified from binary content. Component, terminal, wire and PCB object decoding remain open.
