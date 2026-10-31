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
  assert.deepEqual(
    result.componentMetadata.components.map(({ reference, pinEntryOffset, pinEntryStatus, pins }) => ({
      reference,
      pinEntryOffset,
      pinEntryStatus,
      pins,
    })),
    [
      {
        reference: "B1",
        pinEntryOffset: 96,
        pinEntryStatus: "decoded",
        pins: [{ name: "+", number: "" }, { name: "-", number: "" }],
      },
      {
        reference: "D1",
        pinEntryOffset: 137,
        pinEntryStatus: "decoded",
        pins: [{ name: "A", number: "" }, { name: "K", number: "" }],
      },
      {
        reference: "R1",
        pinEntryOffset: 178,
        pinEntryStatus: "decoded",
        pins: [{ name: "1", number: "1" }, { name: "2", number: "2" }],
      },
    ],
  );
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
  assert.deepEqual(result.schematicComponents.wireMarkerSpans, [
    { offset: 72831, byteWindowLength: 50, nextBoundary: "wire-marker" },
    { offset: 72881, byteWindowLength: 50, nextBoundary: "wire-marker" },
    { offset: 72931, byteWindowLength: 83, nextBoundary: "wire-marker" },
    { offset: 73014, byteWindowLength: 50, nextBoundary: "wire-marker" },
    { offset: 73064, byteWindowLength: 50, nextBoundary: "wire-marker" },
    { offset: 73114, byteWindowLength: 69, nextBoundary: "object-data-marker" },
  ]);
  assert.deepEqual(
    result.schematicComponents.wireSegments.map(({ objectOffset, markerOffset, byteLength, vertexCount, points }) => ({
      objectOffset,
      markerOffset,
      byteLength,
      vertexCount,
      points,
    })),
    [
      {
        objectOffset: 72806,
        markerOffset: 72831,
        byteLength: 50,
        vertexCount: 2,
        points: [{ x: -3200, y: 200 }, { x: -3200, y: 100 }],
      },
      {
        objectOffset: 72856,
        markerOffset: 72881,
        byteLength: 50,
        vertexCount: 2,
        points: [{ x: -2500, y: 100 }, { x: -3200, y: 100 }],
      },
      {
        objectOffset: 72906,
        markerOffset: 72931,
        byteLength: 58,
        vertexCount: 3,
        points: [{ x: -4000, y: 0 }, { x: -3200, y: 0 }, { x: -3200, y: 100 }],
      },
      {
        objectOffset: 72989,
        markerOffset: 73014,
        byteLength: 50,
        vertexCount: 2,
        points: [{ x: -2500, y: 600 }, { x: -3200, y: 600 }],
      },
      {
        objectOffset: 73039,
        markerOffset: 73064,
        byteLength: 50,
        vertexCount: 2,
        points: [{ x: -3200, y: 600 }, { x: -3200, y: 600 }],
      },
      {
        objectOffset: 73089,
        markerOffset: 73114,
        byteLength: 58,
        vertexCount: 3,
        points: [{ x: -4000, y: 700 }, { x: -3200, y: 700 }, { x: -3200, y: 600 }],
      },
    ],
  );
  assert.deepEqual(result.schematicComponents.unresolvedWireMarkerOffsets, []);
  assert.deepEqual(
    result.schematicComponents.wireTouchGroups,
    [
      { wireObjectOffsets: [72806, 72856, 72906] },
      { wireObjectOffsets: [72989, 73039, 73089] },
    ],
  );
  assert.deepEqual(result.schematicComponents.junctionNodes, [
    {
      objectOffset: 72781,
      x: -3200,
      y: 100,
      rawX: -8128000,
      rawY: 254000,
      wireObjectOffsets: [72806, 72856, 72906],
    },
    {
      objectOffset: 72964,
      x: -3200,
      y: 600,
      rawX: -8128000,
      rawY: 1524000,
      wireObjectOffsets: [72989, 73039, 73089],
    },
  ]);
  assert.deepEqual(result.schematicComponents.wireSegments[0].rawPoints, [
    { x: -8128000, y: 508000 },
    { x: -8128000, y: 254000 },
  ]);
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
    result.schematicComponents.componentInstances.map(({ reference, recordStartOffset, wireAddressReferences }) => ({
      reference,
      recordStartOffset,
      wireAddressReferences,
    })),
    [
      {
        reference: "B1",
        recordStartOffset: 71629,
        wireAddressReferences: [
          { byteOffset: 71975, wireObjectOffset: 73089 },
          { byteOffset: 71979, wireObjectOffset: 72906 },
        ],
      },
      {
        reference: "D1",
        recordStartOffset: 71984,
        wireAddressReferences: [
          { byteOffset: 72391, wireObjectOffset: 73039 },
          { byteOffset: 72395, wireObjectOffset: 72806 },
        ],
      },
      {
        reference: "R1",
        recordStartOffset: 72400,
        wireAddressReferences: [
          { byteOffset: 72773, wireObjectOffset: 72856 },
          { byteOffset: 72777, wireObjectOffset: 72989 },
        ],
      },
    ],
  );
  assert.deepEqual(
    result.schematicComponents.componentInstances.map(({ reference, pinSlotTableOffset, pinSlotMappingStatus, pinConnections }) => ({
      reference,
      pinSlotTableOffset,
      pinSlotMappingStatus,
      pinConnections,
    })),
    [
      {
        reference: "B1",
        pinSlotTableOffset: 71975,
        pinSlotMappingStatus: "matched-by-cdb-order",
        pinConnections: [
          { slotIndex: 0, pinName: "+", pinNumber: "", wireObjectOffset: 73089 },
          { slotIndex: 1, pinName: "-", pinNumber: "", wireObjectOffset: 72906 },
        ],
      },
      {
        reference: "D1",
        pinSlotTableOffset: 72391,
        pinSlotMappingStatus: "matched-by-cdb-order",
        pinConnections: [
          { slotIndex: 0, pinName: "A", pinNumber: "", wireObjectOffset: 73039 },
          { slotIndex: 1, pinName: "K", pinNumber: "", wireObjectOffset: 72806 },
        ],
      },
      {
        reference: "R1",
        pinSlotTableOffset: 72773,
        pinSlotMappingStatus: "matched-by-cdb-order",
        pinConnections: [
          { slotIndex: 0, pinName: "1", pinNumber: "1", wireObjectOffset: 72856 },
          { slotIndex: 1, pinName: "2", pinNumber: "2", wireObjectOffset: 72989 },
        ],
      },
    ],
  );
  assert.deepEqual(
    result.schematicComponents.wireConnectedGroups,
    [
      {
        wireObjectOffsets: [72806, 72856, 72906],
        junctionNodeOffsets: [72781],
        componentPins: [
          { reference: "B1", slotIndex: 1, pinName: "-", pinNumber: "" },
          { reference: "D1", slotIndex: 1, pinName: "K", pinNumber: "" },
          { reference: "R1", slotIndex: 0, pinName: "1", pinNumber: "1" },
        ],
      },
      {
        wireObjectOffsets: [72989, 73039, 73089],
        junctionNodeOffsets: [72964],
        componentPins: [
          { reference: "B1", slotIndex: 0, pinName: "+", pinNumber: "" },
          { reference: "D1", slotIndex: 0, pinName: "A", pinNumber: "" },
          { reference: "R1", slotIndex: 1, pinName: "2", pinNumber: "2" },
        ],
      },
    ],
  );
  assert.deepEqual(
    result.schematicComponents.componentInstances.map(({ reference, recordStartOffset, placement }) => ({
      reference,
      recordStartOffset,
      device: placement?.device,
      pinCount: placement?.pinCount,
      pinSlotTableOffset: placement?.pinSlotTableOffset,
      pinSlotAddresses: placement?.pinSlotAddresses,
      labelAttributes: placement?.labelBlocks.map((block) => block.attribute),
      labelTexts: placement?.labelBlocks.map((block) => block.text),
    })),
    [
      {
        reference: "B1",
        recordStartOffset: 71629,
        device: "BATTERY",
        pinCount: 2,
        pinSlotTableOffset: 71975,
        pinSlotAddresses: [73089, 72906],
        labelAttributes: ["COMPONENT ID", "COMPONENT VALUE", "COMPONENT TYPE", "COMPONENT MODEL"],
        labelTexts: ["B1", "9V", "BATTERY", "BATTERY"],
      },
      {
        reference: "D1",
        recordStartOffset: 71984,
        device: "LED-RED",
        pinCount: 2,
        pinSlotTableOffset: 72391,
        pinSlotAddresses: [73039, 72806],
        labelAttributes: ["COMPONENT ID", "COMPONENT VALUE", "COMPONENT TYPE", "COMPONENT MODEL"],
        labelTexts: ["D1", "LED-RED", "LED", "LED-RED"],
      },
      {
        reference: "R1",
        recordStartOffset: 72400,
        device: "10WATT1K",
        pinCount: 2,
        pinSlotTableOffset: 72773,
        pinSlotAddresses: [72856, 72989],
        labelAttributes: ["COMPONENT ID", "COMPONENT VALUE", "COMPONENT TYPE", "COMPONENT MODEL"],
        labelTexts: ["R1", "1k", "RESISTOR", "10WATT1K"],
      },
    ],
  );
  assert.ok(result.schematicComponents.componentInstances.every(
    (instance) =>
      instance.placement !== null &&
      Number.isFinite(instance.placement.origin.x) &&
      Number.isFinite(instance.placement.origin.y) &&
      Number.isFinite(instance.placement.rotationDegrees) &&
      (instance.placement.mirrorFlag === 0 || instance.placement.mirrorFlag === 1),
  ));
  assert.ok(result.schematicComponents.componentInstances.every(
    (instance) => instance.symbolDefinition !== null && instance.symbolDefinition.pins.length === 2,
  ));
  assert.deepEqual(
    result.schematicComponents.componentInstances.map((instance) => ({
      reference: instance.reference,
      symbolPins: instance.symbolDefinition?.pins.map((pin) => ({
        name: pin.name,
        number: pin.number,
      })),
    })),
    [
      { reference: "B1", symbolPins: [{ name: "+", number: "" }, { name: "-", number: "" }] },
      { reference: "D1", symbolPins: [{ name: "A", number: "" }, { name: "K", number: "" }] },
      { reference: "R1", symbolPins: [{ name: "1", number: "1" }, { name: "2", number: "2" }] },
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
    pinEntryOffset: null,
    pinEntryStatus: "unavailable",
    pins: [],
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


test("Proteus DSN: agrupa contactos geométricos pero no cruces interiores sin vértice", () => {
  const marker = Buffer.concat([Buffer.from("OBJECT DATA", "ascii"), Buffer.from([0])]);
  const wire = (points: Array<[number, number]>) => {
    const bytes = Buffer.from([
      0x00, 0x1d, 0x00, 0x00, 0x00,
      0x00, 0xc0, 0x9e, 0x00, 0x00,
      0x00, 0x40, 0x00,
      0x00, 0x01, 0xff, 0xff, 0xff, 0x00, 0xff, 0xff, 0xff, 0x00,
      0x02, 0x7f, 0x57, 0x49, 0x52, 0x45, 0x00, 0x00, 0x00,
      0x00, 0x00, // 16-bit vertex count at byte offset 32.
    ]);
    bytes.writeUInt16LE(points.length, 32);
    const vertices = Buffer.alloc(points.length * 8);
    points.forEach(([x, y], index) => {
      vertices.writeInt32LE(x * 2540, index * 8);
      vertices.writeInt32LE(y * 2540, index * 8 + 4);
    });
    return Buffer.concat([bytes, vertices]);
  };

  const dsn = Buffer.concat([
    Buffer.from("ISIS SCHEMATIC FILE", "ascii"),
    Buffer.alloc(8),
    marker,
    wire([[-100, 0], [100, 0]]),
    wire([[0, -100], [0, 100]]), // Cruza la horizontal sin tocar ninguno de sus vértices.
    wire([[25, 0], [25, 50]]), // Su primer vértice cae sobre la horizontal, pero fuera del cruce vertical.
  ]);
  const result = inspectProteusSchematicBytes(dsn);

  assert.equal(result.wireSegments.length, 3);
  const [horizontal, crossing, tee] = result.wireSegments.map((segment) => segment.objectOffset);
  assert.deepEqual(result.wireTouchGroups, [
    { wireObjectOffsets: [horizontal, tee] },
    { wireObjectOffsets: [crossing] },
  ]);
});
