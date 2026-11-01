# Native EDA format compatibility

Status: **reference inspection implemented; native project generation is not implemented yet**. This document distinguishes format recognition from actual circuit decoding and export.

## Reference files inspected (31 October 2026)

The repository contains three reference projects under `archivosdeprueba/compatibilidad/`:

| File | Size | Observed structure | What is confirmed |
|---|---:|---|---|
| `Mathelecprueba.lvw` | 1,144 bytes | Binary document beginning with `44 73 67 00` (`Dsg\\0`) | Recognizable New Wave / Livewire-family signature; body remains opaque |
| `Mathelecprueba.pcb` | 1,093 bytes | Binary document beginning with the same `Dsg\\0` signature | Recognizable New Wave / PCB Wizard-family signature; body remains opaque |
| `mathelecprueba.pdsprj` | 12,281 bytes | ZIP container | Contains `PROJECT.XML`, `ROOT.DSN`, `ROOT.CDB` and `SCRIPTS/PWRRAILS.DAT` |

The Livewire and PCB Wizard samples share the first 38 bytes, but the binary content diverges at byte offset 38. Therefore, the signature and common prefix cannot distinguish these two applications; the file extension is the only discriminator currently used by the inspector. The report states this through `formatIdentification.selectedBy = "file-extension"` and does not claim an application-specific signature check. Both real fixtures contain two length-prefixed ASCII document fields: `page &p of &n` starts at offset 90 and has byte `0x0D` at offset 89; `Arial` starts at offset 104 and has byte `0x05` at offset 103. The inspector exposes `textFields` with the text offset, prefix offset, declared length, decoded length and validation status. A negative test confirms that a marker with a mismatched preceding byte remains `marker-only`. These are document-formatting fields, not decoded circuit objects, components or connections.

The Proteus file is a ZIP project container. `PROJECT.XML` is text XML, while `ROOT.DSN` and `ROOT.CDB` are binary. A valid ZIP wrapper is not sufficient to create a valid Proteus schematic: the DSN design content still needs a verified decoder/writer.

## Expanded reference fixtures (1 November 2026)

The user supplied two saved variants for each New Wave format and two additional Proteus projects. All nine files are now included in regression tests.

| Format | Original | Variant 2a | Variant 2b | What the current reader proves |
|---|---:|---:|---:|---|
| Livewire 1.11 | 1,144 B | 1,462 B | 1,616 B | All three are recognized as Dsg-family files and preserve validated document fields; component, symbol and wire records remain undecoded. |
| PCB Wizard 3.50 | 1,093 B | 1,428 B | 1,428 B | All three are recognized as Dsg-family files and preserve validated document fields; board outline, footprints, pads, nets and copper tracks remain undecoded. |
| Proteus 8.13 | 12,281 B | 12,756 B | 12,766 B | All three ZIP containers and their essential project entries pass integrity checks; instances, placement and WIRE geometry are regression-tested across the three projects. |

The New Wave files are demonstrably different binary documents, but differential byte ranges alone do not identify component or connection fields. The current reader intentionally does not label those regions as components, coordinates, pads or tracks without a reproducible record schema. The Livewire and PCB Wizard milestones therefore remain unchanged.

### Proteus: three real project fixtures

The original project and both user-saved variants retain the three identified CDB/DSN instances B1, D1 and R1. The current parser recovers their device, visible value, component origin, rotation, CDB pin entries and component slot-to-WIRE pointers. The three archives pass the same ZIP and essential-entry validation.

| Evidence | Original | Variant 2a | Variant 2b |
|---|---:|---:|---:|
| Placed identified components | 3 | 3 | 3 |
| WIRE segments decoded | 6 | 10 | 10 |
| T-junction nodes validated | 2 | 4 | 4 |
| Geometric wire groups | 2 groups of 3 | 2 groups of 5 | 2 groups of 5 |
| Unresolved object | — | `SWITCH` | `SWITCH` |

In variant 2b the reader detects the saved placements B1 at (-4100, 400) mil, D1 at (-2900, 400) mil and R1 at (-2400, 300) mil; the original and variant 2a retain (-4000, 400), (-3200, 400) and (-2500, 300) mil respectively. The reader also reconstructs the changed multi-segment wire path in variant 2b. The `SWITCH` object has no conventional designator in the saved files; it is retained as unresolved with its library name instead of being assigned an invented reference.

Every nonzero slot pointer for B1, D1 and R1 in all three projects resolves to a decoded WIRE object. This completes the wire-geometry and slot-to-WIRE milestones for the currently tested Proteus 8.13 subset. It does **not** confirm physical pin-name order: the three projects still lack matching embedded `$PIN` symbol definitions for BATTERY, LED-RED and 10WATT1K. The CDB pin names therefore remain `cdb-order-unverified`. No placed POWER/GROUND terminal was found in these three files, so real terminal coverage remains open.

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
| Livewire 1.11 | Signature only | Partial: two length-prefixed document fields | Not implemented | Not implemented | Not verified |
| PCB Wizard 3.50 | Signature only | Partial: two length-prefixed document fields | Not implemented | Not implemented | Not verified |
| Proteus 8.13 | Project container recognized | Partial: component records, placement, WIRE geometry and slot links; physical pin identity is sample-dependent | Not implemented | Not implemented | Not verified |

The registry is a version-target baseline, not a claim of native import/export compatibility. The tests enforce that distinction so a future change cannot accidentally advertise a decoder or writer before one exists.

## Next compatibility stage: controlled structural decoding

The next implementation milestone is not a native writer yet. It is to establish verified object-level decoding for the formats, in this order:

1. **Proteus 8.13:** the reader isolates placed records under `OBJECT DATA\\0`, excluding library/template markers outside that section. For B1, D1 and R1 it decodes the complete placed-component record: label blocks, device, physical origin (converted to mils), rotation, mirror flag and exact WIRE slot table. The real sample lacks embedded `$PIN` definitions for BATTERY, LED-RED and 10WATT1K, so their CDB names remain provisional. A separate synthetic symbol fixture embeds a two-pin `$PIN` definition in an order different from CDB; regression tests validate physical pin names, transformed roots/endpoints and exact WIRE geometry both unrotated and at 90° with mirror enabled. POWER/GROUND parsing is also tested synthetically; the repository project has no placed power/ground terminal. Objects without a normal reference remain unresolved. Net labels, virtual instruments and complete symbol artwork/netlist still need decoding.
2. **Livewire 1.11:** identify record boundaries and the serialized component / terminal / wire fields in the New Wave binary stream. A successful signature check is not enough.
3. **PCB Wizard 3.50:** investigate its board-specific records independently, including board outline, footprints, numbered pads, nets and tracks. Do not reuse a Livewire decoder merely because both samples begin with `Dsg\\0`.

A decoder is accepted only when it reproduces the known reference circuit's component count, values, positions, pins and connectivity. Then the reconstructed Mathelect circuit must be compared with what the corresponding desktop application displays. Export remains blocked until the same subset can be written and reopened in the target application.

## Implemented in Mathelect

- `lib/eda/native-project-inspector.ts` recognizes the `.lvw`, `.pcb` and `.pdsprj` file families.
- The New Wave inspector checks the `Dsg\\0` family signature, records the extension as the contextual application selector, and decodes the byte-length prefixes for `page &p of &n` and `Arial` when the preceding byte matches the exact ASCII length. It still reports circuit components and connections as not decoded.
- The Proteus inspector parses the ZIP central directory, rejects unsupported/encrypted/unsafe entries, validates `PROJECT.XML` and verifies extracted entries' sizes and CRC32. In `ROOT.DSN`, it scopes component records to `OBJECT DATA\\0`, recovers the visible value, library identifier and brace-delimited properties, then decodes each placed-component record's four label blocks, device, physical origin, rotation, mirror flag and exact WIRE slot table. The repository fixture's B1, D1 and R1 records all decode. Slot-to-wire pointers are validated. When an embedded `$PIN` definition is available, the reader reorders the CDB table by pin name, transforms pin roots/endpoints through rotation and mirror and checks each endpoint against its referenced WIRE segment. A synthetic regression proves this path for a two-pin symbol, including 90° rotation and mirror; the real fixture still lacks matching definitions for its three devices. POWER/GROUND terminal parsing is covered synthetically and cross-checks both the WIRE pointer and connection-point geometry.
- `POST /api/eda/inspect` accepts a multipart field named `file` (up to 12 MB) and returns the inspection report. The preview panel exposes this through **Inspeccionar archivo nativo**; it shows component placement, slot-to-WIRE evidence and physical pin coordinates only when a symbol definition is verified. It does not replace the current Mathelect circuit or claim to import it.
- Proteus ZIP inspection is bounded: at most 256 entries, 16 MB per uncompressed entry, 32 MB total declared uncompressed data and 2 MB for `PROJECT.XML`. Local and central headers are cross-checked, unsafe entry paths are rejected, and extracted XML is size/CRC checked.
- `tests/native-eda-formats.test.ts` uses the three repository samples as regression fixtures. In addition to recognition and container integrity, the Proteus fixture asserts the recovered B1 / D1 / R1 component metadata. These tests do not prove that a generated project opens or simulates in the desktop applications.

This is still **inspection only**. The Proteus reader recovers three placed, metadata-matched components, their origins/orientations, WIRE geometry and exact component slot-to-WIRE pointers. The real fixture does not contain the required `$PIN` definitions, so its physical pin-name order remains unverified. A separate synthetic fixture verifies the embedded-symbol path, including pin-name ordering and transformed pin endpoints at normal and mirrored 90° orientations. POWER/GROUND parsing also has synthetic coverage only. Net labels, complete symbol artwork, virtual instruments and a full electrical netlist remain incomplete; no format has native import/export yet. A second public Proteus project was inspected manually to study a larger object list and virtual instruments; that file is not added to the automated fixtures, so automated regression coverage still relies on the repository's own sample plus synthetic edge-case records. No format has native import or export yet.

## What is still required for real import/export

### Livewire

The binary records must be decoded into component instances, values, positions, terminal/pin identifiers, wires, and simulation properties. Then the writer must emit those records from Mathelect's circuit model. The common `Dsg` signature is not enough to safely build the record stream.

### Proteus

The next Proteus stage is to obtain projects that embed the matching library `$PIN` definitions, verify the transformed physical pin roots/endpoints against WIRE geometry across rotations and mirrors, and add a real placed POWER/GROUND terminal fixture. Then decode net labels, virtual instruments and the complete symbol artwork before deriving a full electrical netlist. The current parser is still checked primarily against one repository project plus synthetic edge cases, so broader real 8.13 fixtures remain essential. A writer must preserve valid internal references and package the records with expected project metadata; writing only `PROJECT.XML` or a netlist is not native project generation.

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

- Livewire 1.11 and PCB Wizard 3.50 reports now include byte offsets and validated length prefixes for the two document fields in both repository fixtures (offset 90 / prefix 0x0D for `page &p of &n`; offset 104 / prefix 0x05 for `Arial`).
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

The repository fixture's `ROOT.DSN` contains six placed `WIRE` objects. The inspector now validates their 34-byte object prefix, reads the little-endian vertex count, and decodes each following int32 X/Y pair using the empirically confirmed 2540-units-per-mil scale. The six wires have 2, 2, 3, 2, 2 and 3 vertices, with exact object offsets 72806, 72856, 72906, 72989, 73039 and 73089. It preserves the separate raw marker offsets (72831, 72881, 72931, 73014, 73064, 73114) and marker windows (50, 50, 83, 50, 50 and 69 bytes) as diagnostics.

The inspector also groups wire objects when an actual vertex of one wire lies on a segment of another. On this fixture that gives two wire-only groups: `[72806, 72856, 72906]` and `[72989, 73039, 73089]`. A synthetic regression test confirms that an interior crossing without a shared vertex is not merged, while a T-contact at a wire vertex is. This is **not a complete electrical netlist**: component pins, placed terminals, net labels and T-junction node objects are not yet correlated with the groups. The 26 `TERMINAL` markers, three `PROPERTIES` markers (71921, 72249, 72661), and absence of `TERMINAL LABEL` markers remain a separate inventory; marker count is not treated as placed terminal count.

The remaining Proteus schematic work is now specifically: identify the raw placement word semantics with controlled saves/moves; resolve symbol/part definitions to pin geometry; decode terminals, wires and net membership; then build a writer and test open + simulation in Proteus 8.13.


## New Wave identification confidence — 31 October 2026

Both repository samples begin with the same four-byte `Dsg\\0` family signature and share their first 38 bytes. The current inspector therefore reports `formatIdentification.selectedBy = "file-extension"` and `applicationSpecificSignatureVerified = false` for both Livewire and PCB Wizard. This prevents the file inspector from implying that the application-specific format has been independently identified from binary content. Component, terminal, wire and PCB object decoding remain open.


### ROOT.DSN structural marker inventory

The current repository sample is covered by exact offset regression assertions for all six `WIRE\\0` markers, all 26 `TERMINAL\\0` markers, all three `PROPERTIES\\0` markers and the absence of `TERMINAL LABEL\\0`. These are byte positions for later decoding, not interpreted wire counts, pin counts or net connectivity. The second public Proteus project inspected manually has a larger set of wire and terminal markers, but remains a research reference rather than an automated fixture.


The WIRE window lengths are regression diagnostics bounded by the next visible marker/section boundary; they are not yet asserted to be canonical record lengths. Their variable size is a reason to retain raw offsets and defer endpoint decoding until the binary payload structure is established.


## Proteus 8.13 WIRE geometry decode — 31 October 2026

A binary WIRE decoder is now implemented and regression-tested against the repository's actual 8.13 `ROOT.DSN`. Each object is located 25 bytes before its `WIRE\\0` marker; the reader validates the fixed structural bytes while allowing the observed style/color bytes to vary, reads the vertex count from offset +32 and then reads int32 X/Y pairs from +34. Coordinates are converted to mils by dividing by 2540. The supported vertex count is bounded (2–256), and malformed markers are reported rather than treated as wires.

The decoded object offsets, lengths and vertices are asserted exactly in CI. A geometric pass then groups wires only when a vertex of one lies on a segment of another, using integer raw coordinates to avoid floating-point drift. Zero-length two-point wires are retained and can participate in a shared-point contact. An interior crossing without a vertex is not enough to merge two wire groups.

The reader now decodes the 8.13 CDB pin-entry table (one-byte-length pin name and number fields) and the matching u32 pin-slot pointer array at the end of each placed DSN component record. It links a slot to a CDB pin in table order only if the slot count exactly matches the pin-table count and every nonzero pointer resolves to an already validated WIRE object. For the repository fixture, all three two-pin components meet that criterion.

The geometric groups now expose junction-node offsets, component pin-slot associations, and POWER/GROUND terminals when their records point to known WIRE objects and their connection points match the wire geometry. The current repository fixture has no placed POWER/GROUND instances, so terminal parsing is covered by a synthetic test. CDB pin names remain unverified against physical `$PIN` order, and net labels / virtual-instrument terminals are not decoded. These are **wire-connected groups**, not full schematic nets or a simulation-ready imported circuit.


### Component-record wire address references

The 8.13 fixture contains these pointer-sized values in the tails of the three placed component records:

- B1: byte offsets 71975 and 71979 reference WIRE objects 73089 and 72906.
- D1: byte offsets 72391 and 72395 reference WIRE objects 73039 and 72806.
- R1: byte offsets 72773 and 72777 reference WIRE objects 72856 and 72989.

The parser now uses the complete placed-component record to recover the exact slot-table offset and its WIRE object addresses. It preserves the CDB pin labels in table order, but marks their physical association as `cdb-order-unverified` until a matching library `$PIN` definition is found. Zero-valued unconnected slots are kept distinct from valid WIRE pointers.


### Proteus 8.13 — CDB pin table and DSN pin-slot mapping

The actual `ROOT.CDB` fixture includes the following pin-entry tables:

| Component | CDB pin-entry byte offset | Pin slots in CDB order |
|---|---:|---|
| B1 | 96 | `+`, `-` |
| D1 | 137 | `A`, `K` |
| R1 | 178 | `1`, `2` |

In this 8.13 sample, pin names and pin numbers use one-byte length prefixes (the number field may be empty). The reader does not assume the two-byte string lengths used by the later Proteus 9 reference parser.

The corresponding DSN pin-slot arrays are:

- B1: byte offset 71975 → `+` → WIRE object 73089; byte offset 71979 → `-` → WIRE object 72906.
- D1: byte offset 72391 → `A` → WIRE object 73039; byte offset 72395 → `K` → WIRE object 72806.
- R1: byte offset 72773 → pin `1` → WIRE object 72856; byte offset 72777 → pin `2` → WIRE object 72989.

All three CDB pin tables contain two entries, all three DSN pin-slot arrays contain two WIRE pointers, and every pointer resolves to a validated WIRE object. The inspector can therefore preserve a two-slot association and display the CDB pin names in table order, but the status is `slot-table-valid-symbol-order-unverified`, not a confirmed pin-name-to-slot mapping.

The embedded library lookup was also tested for the device names `BATTERY`, `LED-RED` and `10WATT1K`. The current fixture has no matching device-definition headers in the searched library section, so no `$PIN` geometry is available. Every component pin is consequently tagged `cdb-order-unverified`; its physical root, endpoint and endpoint-to-WIRE geometry remain null. This avoids claiming a physical pin connection from table order alone.


## Proteus 8.13 — registros de componente, slots y terminales

El lector consume la estructura de los registros colocados: cuatro bloques de etiqueta (texto, atributo y anclaje), el dispositivo, el origen físico, orientación/espejo y la tabla exacta de slots de conexión. Esta parte se contrasta contra los tres componentes reales B1, D1 y R1 del fixture. Una regresión sintética independiente contiene una definición embebida de dos patas cuyo orden difiere de CDB y valida el reordenamiento por nombre, la transformación de coordenadas y la coincidencia del extremo con el cable a 0° y a 90° con espejo.

La búsqueda de definiciones de símbolo se ejecuta como intento separado: localiza la sección de biblioteca, busca el nombre del dispositivo y valida el bloque antes de leer entradas $PIN. En `mathelecprueba.pdsprj` no se encuentra una cabecera de definición para `BATTERY`, `LED-RED` ni `10WATT1K`. Por eso los nombres de patas CDB se conservan por orden de tabla, pero cada asociación queda marcada como `cdb-order-unverified`; no se generan raíces ni puntos físicos de pin ni se declara coincidencia geométrica con el cable.

También se añadió un lector de terminales `$TERPOWER` y `$TERGROUND`: recupera origen, anclaje, punto de conexión y puntero WIRE. La prueba POWER está cubierta con una fixture sintética; la muestra real no incluye terminales colocados, por lo que aún falta una comparación con un terminal guardado desde Proteus 8.13.

**Límites actuales:** no hay definición $PIN verificada para los dispositivos de la muestra, no se reconstruye el cuerpo gráfico completo ni las etiquetas/nombres de red o instrumentos virtuales, y los grupos conectados son parciales. Esto todavía no equivale a una netlist íntegra, importación editable o simulación aprobada en Proteus 8.13.
