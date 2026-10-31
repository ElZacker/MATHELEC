import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  inspectNativeEdaProject,
  inspectProteusSchematicBytes,
} from "../lib/eda/native-project-inspector";

const fixture = (name: string) =>
  readFileSync(resolve(process.cwd(), "archivosdeprueba", "compatibilidad", name));

test("Livewire: reconoce la firma Dsg del archivo de referencia sin inventar componentes", () => {
  const result = inspectNativeEdaProject("Mathelecprueba.lvw", fixture("Mathelecprueba.lvw"));
  assert.equal(result.format, "livewire");
  assert.equal(result.targetApplication.application, "Livewire");
  assert.equal(result.targetApplication.installedVersion, "1.11");
  assert.equal(result.targetApplication.fileVersionDetected, false);
  assert.equal(result.recognized, true);
  assert.equal(result.signature, "Dsg\\0");
  assert.deepEqual(result.formatIdentification, {
    family: "New Wave Dsg",
    selectedBy: "file-extension",
    confidence: "shared-family-signature-plus-extension",
    applicationSpecificSignatureVerified: false,
  });
  assert.equal(result.componentDataDecoded, false);
  assert.deepEqual(result.textMarkerOffsets, [
    { marker: "page &p of &n", offset: 90 },
    { marker: "Arial", offset: 104 },
  ]);
  assert.ok(result.byteLength > 32);
});

test("PCB Wizard: reconoce la firma Dsg y conserva su identidad por extensión", () => {
  const result = inspectNativeEdaProject("Mathelecprueba.pcb", fixture("Mathelecprueba.pcb"));
  assert.equal(result.format, "pcb-wizard");
  assert.equal(result.targetApplication.application, "PCB Wizard");
  assert.equal(result.targetApplication.installedVersion, "3.50");
  assert.equal(result.targetApplication.fileVersionDetected, false);
  assert.equal(result.recognized, true);
  assert.equal(result.signature, "Dsg\\0");
  assert.deepEqual(result.formatIdentification, {
    family: "New Wave Dsg",
    selectedBy: "file-extension",
    confidence: "shared-family-signature-plus-extension",
    applicationSpecificSignatureVerified: false,
  });
  assert.equal(result.componentDataDecoded, false);
  assert.deepEqual(result.textMarkerOffsets, [
    { marker: "page &p of &n", offset: 90 },
    { marker: "Arial", offset: 104 },
  ]);
  assert.ok(result.byteLength > 32);
});

test("Proteus: valida el contenedor y los archivos internos esenciales del proyecto real", () => {
  const result = inspectNativeEdaProject("mathelecprueba.pdsprj", fixture("mathelecprueba.pdsprj"));
  assert.equal(result.format, "proteus");
  assert.equal(result.targetApplication.application, "Proteus");
  assert.equal(result.targetApplication.installedVersion, "8.13");
  assert.equal(result.targetApplication.fileVersionDetected, false);
  assert.equal(result.container, "zip");
  assert.equal(result.hasProjectXml, true);
  assert.equal(result.hasRootDsn, true);
  assert.equal(result.hasRootCdb, true);
  assert.equal(result.schematicDecoded, false);
  assert.equal(result.status, "recognized-project-with-partial-schematic-data");
  assert.equal(result.componentMetadata.status, "partial");
  assert.equal(result.componentMetadata.source, "ROOT.CDB");
  assert.equal(result.componentMetadata.count, 3);
  assert.deepEqual(
    result.componentMetadata.components.map(({ reference, value, device, package: packageName }) => ({
      reference,
      value,
      device,
      package: packageName,
    })),
    [
      { reference: "B1", value: "9V", device: "BATTERY", package: "" },
      { reference: "D1", value: "LED-RED", device: "LED-RED", package: "" },
      { reference: "R1", value: "1k", device: "10WATT1K", package: "RES180" },
    ],
  );
  assert.equal(result.componentMetadata.components.find((component) => component.reference === "D1")?.properties.VF, "2.2V");
  assert.equal(result.componentMetadata.components.find((component) => component.reference === "R1")?.properties.PRIMTYPE, "RESISTOR");
  const batteryProperties = result.schematicComponents.componentInstances.find((instance) => instance.reference === "B1")?.properties;
  const ledProperties = result.schematicComponents.componentInstances.find((instance) => instance.reference === "D1")?.properties;
  const resistorProperties = result.schematicComponents.componentInstances.find((instance) => instance.reference === "R1")?.properties;
  assert.equal(batteryProperties?.PRIMITIVE, "ANALOGUE");
  assert.equal(batteryProperties?.RINT, "0.1");
  assert.equal(ledProperties?.MODFILE, "LEDA");
  assert.equal(ledProperties?.VF, "2.2V");
  assert.equal(ledProperties?.IMAX, "10mA");
  assert.equal(ledProperties?.ROFF, "100k");
  assert.equal(resistorProperties?.PRIMTYPE, "RESISTOR");
  assert.equal(resistorProperties?.PACKAGE, "RES180");
  assert.ok(result.entries.some((entry) => entry.name.toUpperCase() === "PROJECT.XML"));
  assert.ok(result.entries.some((entry) => entry.name.toUpperCase() === "ROOT.DSN"));
  assert.equal(result.schematicComponents.source, "ROOT.DSN");
  assert.equal(result.schematicComponents.header, "ISIS SCHEMATIC FILE");
  assert.equal(result.schematicComponents.status, "partial");
  assert.equal(result.schematicComponents.objectDataSectionCount, 2);
  assert.equal(result.schematicComponents.componentIdMarkersOutsideObjectData, 0);
  assert.deepEqual(result.schematicComponents.wireMarkerOffsets, [72831, 72881, 72931, 73014, 73064, 73114]);
  assert.deepEqual(result.schematicComponents.terminalMarkerOffsets, [
    10494, 10599, 10658, 10885, 11162, 11221, 11424, 11483, 11542,
    11601, 11688, 11743, 11974, 12177, 12240, 12299, 12385, 12444,
    12503, 12562, 12791, 12896, 13455, 13560, 13789, 13894,
  ]);
  assert.deepEqual(result.schematicComponents.terminalLabelMarkerOffsets, []);
  assert.deepEqual(result.schematicComponents.propertiesMarkerOffsets, [71921, 72249, 72661]);
  assert.equal(result.schematicComponents.componentInstanceCount, 3);
  assert.deepEqual(
    result.schematicComponents.componentInstances.map((instance) => instance.reference),
    ["B1", "D1", "R1"],
  );
  assert.deepEqual(
    result.schematicComponents.componentInstances.map(({ reference, libraryName, libraryNameMatchesDeviceMetadata }) => ({
      reference,
      libraryName,
      libraryNameMatchesDeviceMetadata,
    })),
    [
      { reference: "B1", libraryName: "BATTERY", libraryNameMatchesDeviceMetadata: true },
      { reference: "D1", libraryName: "LED-RED", libraryNameMatchesDeviceMetadata: true },
      { reference: "R1", libraryName: "10WATT1K", libraryNameMatchesDeviceMetadata: true },
    ],
  );
  assert.ok(result.schematicComponents.componentInstances.every(
    (instance) => instance.sourceOffset > 0,
  ));
  assert.deepEqual(
    result.schematicComponents.componentInstances.map(({ reference, rawPlacementWords }) => ({
      reference,
      rawPlacementWords,
    })),
    [
      { reference: "B1", rawPlacementWords: ["ff6d0840", "00179080"] },
      { reference: "D1", rawPlacementWords: ["ff8ae018", "001476c0"] },
      { reference: "R1", rawPlacementWords: ["ffa2e7a8", "0013b050"] },
    ],
  );
  assert.ok(result.schematicComponents.componentInstances.every((instance) => instance.matchesComponentMetadata));
  assert.deepEqual(result.schematicComponents.componentReferencesWithoutMetadata, []);
  assert.deepEqual(result.schematicComponents.metadataReferencesWithoutSchematicInstance, []);
  assert.ok(result.schematicComponents.componentInstances.every(
    (instance) =>
      instance.libraryName === null || typeof instance.libraryName === "string",
  ));
  assert.ok(result.schematicComponents.componentInstances.every(
    (instance) =>
      instance.libraryNameMatchesDeviceMetadata === null ||
      typeof instance.libraryNameMatchesDeviceMetadata === "boolean",
  ));
  assert.deepEqual(
    result.schematicComponents.componentLibraryNamesWithoutDeviceMetadataMatch,
    result.schematicComponents.componentInstances
      .filter((instance) => instance.libraryNameMatchesDeviceMetadata === false)
      .map((instance) => instance.reference)
      .sort((left, right) => left.localeCompare(right)),
  );
});

test("rechaza extensiones no admitidas", () => {
  assert.throws(
    () => inspectNativeEdaProject("circuito.txt", Buffer.from("not a circuit")),
    /Formato no admitido/,
  );
});

test("rechaza archivos New Wave con firma incorrecta", () => {
  assert.throws(
    () => inspectNativeEdaProject("archivo.lvw", Buffer.from("not a Livewire file")),
    /firma binaria Dsg/,
  );
});

test("rechaza un proyecto Proteus que no sea ZIP", () => {
  assert.throws(
    () => inspectNativeEdaProject("archivo.pdsprj", Buffer.from("not a Proteus project")),
    /ZIP válido|demasiado pequeño/,
  );
});


test("Proteus DSN: conserva objetos especiales sin designador y no confunde plantillas con instancias", () => {
  const token = (value: string) => {
    const bytes = Buffer.from(value, "ascii");
    return Buffer.concat([Buffer.from([0xff, bytes.length]), bytes]);
  };
  const marker = (value: string) => Buffer.concat([
    Buffer.from(value, "ascii"),
    Buffer.from([0]),
  ]);

  const dsn = Buffer.concat([
    Buffer.from("ISIS SCHEMATIC FILE", "ascii"),
    Buffer.alloc(8),
    marker("COMPONENT ID"), // Definición/template: no está dentro de OBJECT DATA.
    Buffer.alloc(100),
    marker("OBJECT DATA"),
    token("R1"),
    Buffer.from([0x01, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00]),
    marker("COMPONENT ID"),
    Buffer.alloc(5),
    token("15k"),
    Buffer.alloc(5),
    marker("COMPONENT VALUE"),
    Buffer.alloc(5),
    token("RESISTOR"),
    Buffer.alloc(4),
    marker("PROPERTIES"),
    Buffer.alloc(5),
    Buffer.from("{PRIMTYPE=RESISTOR}\\n{PACKAGE=RES180}\\0", "ascii"),
    Buffer.alloc(100),
    marker("OBJECT DATA"),
    Buffer.alloc(5), // El siguiente objeto es un instrumento virtual, no un componente etiquetado.
    marker("COMPONENT ID"),
    Buffer.alloc(5),
    token("$IOSCOPE"),
    Buffer.alloc(5),
    marker("COMPONENT VALUE"),
    Buffer.alloc(5),
    token("$IOSCOPE"),
  ]);

  const result = inspectProteusSchematicBytes(dsn, [{
    reference: "R1",
    value: "15k",
    device: "RESISTOR",
    package: "RES180",
    properties: {},
  }]);

  assert.equal(result.objectDataSectionCount, 2);
  assert.equal(result.componentIdMarkersOutsideObjectData, 1);
  assert.equal(result.componentInstanceCount, 1);
  assert.equal(result.componentInstances[0].reference, "R1");
  assert.equal(result.componentInstances[0].libraryName, "RESISTOR");
  assert.equal(result.componentInstances[0].libraryNameMatchesDeviceMetadata, true);
  assert.deepEqual(result.componentInstances[0].rawPlacementWords, ["00000001", "00000002"]);
  assert.equal(result.componentInstances[0].properties.PRIMTYPE, "RESISTOR");
  assert.equal(result.componentInstances[0].properties.PACKAGE, "RES180");
  assert.equal(result.unresolvedObjectCount, 1);
  assert.deepEqual(result.unresolvedObjects, [{
    sourceOffset: result.unresolvedObjects[0].sourceOffset,
    reference: null,
    value: "$IOSCOPE",
    libraryName: "$IOSCOPE",
    reason: "missing-reference-designator",
  }]);
});
