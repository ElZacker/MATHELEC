# Native EDA format compatibility

Status: research and fixture collection. This document is deliberately explicit about what is and is not implemented.

## Current Mathelect export state

The application currently exports its own JSON project, an SVG drawing, and a text connection report. SVG and the text report are not editable simulation projects for Livewire, Proteus, or PCB Wizard. No native writer for those three formats is currently present.

## Target formats and constraints

### Livewire

- Native circuit documents use the `.LVW` extension.
- A useful document must preserve actual component instances, values, positions, pins, wires, and simulation inputs—not just a rendered drawing.
- PCB Wizard 3 is documented by New Wave Concepts as able to open Livewire circuit files and convert them into PCB layouts.
- The binary/container structure and stable writer interface are not established by the current repository.

### Proteus

- The current project extension is `.pdsprj`; legacy ISIS designs use `.DSN`.
- Sample `.pdsprj` files are ZIP containers. Common entries include `PROJECT.XML`, `ROOT.DSN`, and `ROOT.CDB`.
- `ROOT.DSN` carries schematic data and is binary, so generating a valid project requires more than creating XML or a text netlist.
- A SPICE netlist contains electrical connectivity and model directives but no graphical schematic placement. It must never be advertised as a native Proteus project.

### PCB Wizard

- The native project extension is `.PCB`.
- A valid PCB design needs board geometry, component footprints, pad numbering, nets and copper routing. A list of schematic components or an SVG is not a PCB.
- The official product documentation describes Gerber and NC-Drill outputs as manufacturing exports. Those outputs are not an editable PCB Wizard project.

## Required reference fixtures

For each application/version that Mathelect intends to support, collect a small project created and saved by that application itself:

1. **Livewire:** a simple, fully wired low-voltage LED + series resistor + DC source circuit, saved as `.LVW`.
2. **Proteus:** the same simple circuit, saved as a `.pdsprj` project. Include the complete project file, not a screenshot or renamed text file.
3. **PCB Wizard:** a small PCB document created from the circuit, with real footprints assigned and all required tracks routed, saved as `.PCB`. Include the source `.LVW` if the PCB was generated from Livewire.

Do not upload installers, licensed application binaries, private credentials, or third-party component libraries. The user's own small example projects are sufficient for initial format analysis.

## Exporter architecture

```text
AI proposal
  -> Mathelect Circuit model
  -> structural + electrical validation
  -> target component/pin/footprint mapper
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
- Keep fixtures and expected mappings under automated regression tests once their use and redistribution are confirmed.

## Initial research sources

- New Wave Concepts, PCB Wizard FAQ: PCB Wizard 3 can open Livewire circuit files and convert them to PCB layouts: https://www.new-wave-concepts.com/ed/pw_faq.html
- New Wave Concepts, PCB Wizard features: circuit capture, automatic wiring, PCB layout, routing, Gerber and NC-Drill outputs: https://new-wave-concepts.com/ed/pw_feat.html
- Labcenter ISIS User Manual: design files, sections, modules, libraries and netlist export are distinct file types: https://else.fcim.utm.md/pluginfile.php/96458/mod_resource/content/2/EBook%20-%20Proteus%20Manual.pdf
- Proteus project sample analysis: `.pdsprj` ZIP structure and binary `ROOT.DSN`: https://deepwiki.com/codehacked/Pulse-and-Wave-Generator/3.2-schematic-design-data-(root.dsn)

These references establish the initial investigation only. They do not substitute for opening generated files in the exact application versions used by Mathelect users.
