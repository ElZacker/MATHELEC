# Native EDA format compatibility

Status: **reference inspection implemented; native project generation is not implemented yet**. This document distinguishes format recognition from actual circuit decoding and export.

## Reference files inspected (31 October 2026)

The repository contains three reference projects under `archivosdeprueba/compatibilidad/`:

| File | Size | Observed structure | What is confirmed |
|---|---:|---|---|
| `Mathelecprueba.lvw` | 1,144 bytes | Binary document beginning with `44 73 67 00` (`Dsg\\0`) | Recognizable New Wave / Livewire-family signature; body remains opaque |
| `Mathelecprueba.pcb` | 1,093 bytes | Binary document beginning with the same `Dsg\\0` signature | Recognizable New Wave / PCB Wizard-family signature; body remains opaque |
| `mathelecprueba.pdsprj` | 12,281 bytes | ZIP container | Contains `PROJECT.XML`, `ROOT.DSN`, `ROOT.CDB` and `SCRIPTS/PWRRAILS.DAT` |

The Livewire and PCB Wizard samples share the first four signature bytes, but the binary content diverges shortly afterwards. Therefore, the signature alone cannot distinguish these two applications; the file extension and application context are both required. Both samples also contain the printable strings `page &p of &n` and `Arial`, which are document metadata, not a decoded circuit model.

The Proteus file is a ZIP project container. `PROJECT.XML` is text XML, while `ROOT.DSN` and `ROOT.CDB` are binary. A valid ZIP wrapper is not sufficient to create a valid Proteus schematic: the DSN design content still needs a verified decoder/writer.

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
| Proteus 8.13 | Project container recognized | ZIP structure partially validated; essential entries located | Not implemented | Not implemented | Not verified |

The registry is a version-target baseline, not a claim of native import/export compatibility. The tests enforce that distinction so a future change cannot accidentally advertise a decoder or writer before one exists.

## Next compatibility stage: controlled structural decoding

The next implementation milestone is not a native writer yet. It is to establish verified object-level decoding for the formats, in this order:

1. **Proteus 8.13:** decode `ROOT.DSN` object records and their references to `ROOT.CDB`; recover component references, pin identifiers and wire/net topology. Keep the ZIP reader separate from the schematic decoder.
2. **Livewire 1.11:** identify record boundaries and the serialized component / terminal / wire fields in the New Wave binary stream. A successful signature check is not enough.
3. **PCB Wizard 3.50:** investigate its board-specific records independently, including board outline, footprints, numbered pads, nets and tracks. Do not reuse a Livewire decoder merely because both samples begin with `Dsg\\0`.

A decoder is accepted only when it reproduces the known reference circuit's component count, values, positions, pins and connectivity. Then the reconstructed Mathelect circuit must be compared with what the corresponding desktop application displays. Export remains blocked until the same subset can be written and reopened in the target application.

## Implemented in Mathelect

- `lib/eda/native-project-inspector.ts` recognizes the `.lvw`, `.pcb` and `.pdsprj` file families.
- The New Wave inspector checks the `Dsg\\0` signature and returns only metadata that can be established safely. It deliberately reports that component data is not decoded.
- The Proteus inspector parses the ZIP central directory, rejects unsupported/encrypted/unsafe entries, validates `PROJECT.XML` and verifies the extracted XML entry's size and CRC32. It reports whether `ROOT.DSN` and `ROOT.CDB` are present without claiming to interpret their contents.
- `POST /api/eda/inspect` accepts a multipart field named `file` (up to 12 MB) and returns the inspection report. The preview panel exposes this through **Inspeccionar archivo nativo**; it does not replace the current Mathelect circuit or claim to import it.
- Proteus ZIP inspection is bounded: at most 256 entries, 16 MB per uncompressed entry, 32 MB total declared uncompressed data and 2 MB for `PROJECT.XML`. Local and central headers are cross-checked, unsafe entry paths are rejected, and extracted XML is size/CRC checked.
- `tests/native-eda-formats.test.ts` uses the three repository samples as regression fixtures. These tests check file recognition and container integrity, not that the projects open in the desktop applications.

This is the first real compatibility layer, but it is **inspection only**. The current code does not reconstruct the sample circuits, map component library identifiers, or write native projects.

## What is still required for real import/export

### Livewire

The binary records must be decoded into component instances, values, positions, terminal/pin identifiers, wires, and simulation properties. Then the writer must emit those records from Mathelect's circuit model. The common `Dsg` signature is not enough to safely build the record stream.

### Proteus

The next decoder must interpret `ROOT.DSN` (schematic objects, symbol/library references, pin identities, wires, nets and placement) and the relevant `ROOT.CDB` database records. A writer must maintain valid internal references and package those records with the expected project metadata. Writing only `PROJECT.XML` or a netlist is not native project generation.

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
