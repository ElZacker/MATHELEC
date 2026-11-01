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
  assert.deepEqual(result.textFields, [
    { marker: "page &p of &n", offset: 90, lengthPrefixOffset: 89, declaredLength: 13, decodedLength: 13, status: "length-prefix-validated" },
    { marker: "Arial", offset: 104, lengthPrefixOffset: 103, declaredLength: 5, decodedLength: 5, status: "length-prefix-validated" },
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
  assert.deepEqual(result.textFields, [
    { marker: "page &p of &n", offset: 90, lengthPrefixOffset: 89, declaredLength: 13, decodedLength: 13, status: "length-prefix-validated" },
    { marker: "Arial", offset: 104, lengthPrefixOffset: 103, declaredLength: 5, decodedLength: 5, status: "length-prefix-validated" },
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
        pinSlotMappingStatus: "slot-table-valid-symbol-order-unverified",
        pinConnections: [
          { mappingBasis: "cdb-order-unverified", slotIndex: 0, pinName: "+", pinNumber: "", connectionPoint: null, connectionPointMatchesWire: null, symbolRoot: null, wireObjectOffset: 73089 },
          { mappingBasis: "cdb-order-unverified", slotIndex: 1, pinName: "-", pinNumber: "", connectionPoint: null, connectionPointMatchesWire: null, symbolRoot: null, wireObjectOffset: 72906 },
        ],
      },
      {
        reference: "D1",
        pinSlotTableOffset: 72391,
        pinSlotMappingStatus: "slot-table-valid-symbol-order-unverified",
        pinConnections: [
          { mappingBasis: "cdb-order-unverified", slotIndex: 0, pinName: "A", pinNumber: "", connectionPoint: null, connectionPointMatchesWire: null, symbolRoot: null, wireObjectOffset: 73039 },
          { mappingBasis: "cdb-order-unverified", slotIndex: 1, pinName: "K", pinNumber: "", connectionPoint: null, connectionPointMatchesWire: null, symbolRoot: null, wireObjectOffset: 72806 },
        ],
      },
      {
        reference: "R1",
        pinSlotTableOffset: 72773,
        pinSlotMappingStatus: "slot-table-valid-symbol-order-unverified",
        pinConnections: [
          { mappingBasis: "cdb-order-unverified", slotIndex: 0, pinName: "1", pinNumber: "1", connectionPoint: null, connectionPointMatchesWire: null, symbolRoot: null, wireObjectOffset: 72856 },
          { mappingBasis: "cdb-order-unverified", slotIndex: 1, pinName: "2", pinNumber: "2", connectionPoint: null, connectionPointMatchesWire: null, symbolRoot: null, wireObjectOffset: 72989 },
        ],
      },
    ],
  );
  assert.deepEqual(
    result.schematicComponents.wireConnectedGroups.map((group) => ({
      wireObjectOffsets: group.wireObjectOffsets,
      junctionNodeOffsets: group.junctionNodeOffsets,
      componentPins: group.componentPins.map(({ reference, slotIndex, pinName, pinNumber, mappingBasis }) => ({
        reference,
        slotIndex,
        pinName,
        pinNumber,
        mappingBasis,
      })),
    })),
    [
      {
        wireObjectOffsets: [72806, 72856, 72906],
        junctionNodeOffsets: [72781],
        componentPins: [
          { reference: "B1", slotIndex: 1, pinName: "-", pinNumber: "", mappingBasis: "cdb-order-unverified" },
          { reference: "D1", slotIndex: 1, pinName: "K", pinNumber: "", mappingBasis: "cdb-order-unverified" },
          { reference: "R1", slotIndex: 0, pinName: "1", pinNumber: "1", mappingBasis: "cdb-order-unverified" },
        ],
      },
      {
        wireObjectOffsets: [72989, 73039, 73089],
        junctionNodeOffsets: [72964],
        componentPins: [
          { reference: "B1", slotIndex: 0, pinName: "+", pinNumber: "", mappingBasis: "cdb-order-unverified" },
          { reference: "D1", slotIndex: 0, pinName: "A", pinNumber: "", mappingBasis: "cdb-order-unverified" },
          { reference: "R1", slotIndex: 1, pinName: "2", pinNumber: "2", mappingBasis: "cdb-order-unverified" },
        ],
      },
    ],
  );
  assert.ok(
    result.schematicComponents.componentInstances.every((instance) => instance.placement !== null),
    JSON.stringify(result.schematicComponents.componentInstances.map((instance) => ({
      reference: instance.reference,
      componentRecordParseStatus: instance.componentRecordParseStatus,
      componentRecordCandidateOffsets: instance.componentRecordCandidateOffsets,
      componentRecordDiagnostics: instance.componentRecordDiagnostics,
    }))),
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
    (instance) => instance.symbolDefinition === null,
  ));
  assert.ok(result.schematicComponents.componentInstances.every(
    (instance) => instance.symbolDefinitionDiagnostics.some(
      (diagnostic) => diagnostic.startsWith("device-definition-not-found:"),
    ),
  ));
  assert.ok(result.schematicComponents.componentInstances.every(
    (instance) =>
      instance.pinSlotMappingStatus === "slot-table-valid-symbol-order-unverified" &&
      instance.pinConnections.every((pin) =>
        pin.mappingBasis === "cdb-order-unverified" &&
        pin.symbolRoot === null &&
        pin.connectionPoint === null &&
        pin.connectionPointMatchesWire === null
      ),
  ));
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
  assert.equal(result.componentInstances[0].placement, null);
  assert.equal(result.componentInstances[0].properties.PRIMTYPE, "RESISTOR");
  assert.equal(result.componentInstances[0].properties.PACKAGE, "RES180");
  assert.equal(result.unresolvedObjectCount, 1);
  assert.deepEqual(result.unresolvedObjects, [{
    sourceOffset: result.unresolvedObjects[0].sourceOffset,
    recordStartOffset: null,
    reference: null,
    value: "$IOSCOPE",
    libraryName: "$IOSCOPE",
    reason: "missing-reference-designator",
    componentRecordParseStatus: "not-found",
    placement: null,
    wireAddressReferences: [],
    properties: {},
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


test("Proteus DSN: decodifica un terminal POWER y valida su puntero y punto de conexión", () => {
  const signature = Buffer.from("ISIS SCHEMATIC FILE", "ascii");
  const objectData = Buffer.from("OBJECT DATA\0", "ascii");
  const wireHeader = Buffer.from([
    0x00, 0x1d, 0x00, 0x00, 0x00,
    0x00, 0xc0, 0x9e, 0x00, 0x00,
    0x00, 0x40, 0x00,
    0x00, 0x01, 0xff, 0xff, 0xff, 0x00, 0xff, 0xff, 0xff, 0x00,
    0x02, 0x7f, 0x57, 0x49, 0x52, 0x45, 0x00, 0x00, 0x00,
    0x00, 0x00,
  ]);
  wireHeader.writeUInt16LE(2, 32);
  const wireVertices = Buffer.alloc(16);
  wireVertices.writeInt32LE(0, 0);
  wireVertices.writeInt32LE(0, 4);
  wireVertices.writeInt32LE(200 * 2540, 8);
  wireVertices.writeInt32LE(0, 12);
  const wire = Buffer.concat([wireHeader, wireVertices]);

  const dsnPrefix = Buffer.concat([signature, Buffer.alloc(8), objectData]);
  const wireObjectOffset = dsnPrefix.length;
  const terminalName = Buffer.from("$TERPOWER", "ascii");
  const terminal = Buffer.alloc(96 + terminalName.length);
  terminal[0] = 0x10;
  terminal.writeInt32LE(100 * 2540, 1);
  terminal.writeInt32LE(100 * 2540, 5);
  terminal.writeUInt16LE(terminalName.length, 13);
  terminalName.copy(terminal, 15);
  const tailOffset = 15 + terminalName.length;
  // The read-only 8.13 terminal parser uses the persisted label anchor to
  // reconstruct the connection point, as the terminal records do.
  terminal.writeInt32LE(0, tailOffset + 11);
  terminal.writeInt32LE(300 * 2540, tailOffset + 15);
  Buffer.from("TERMINAL LABEL\0", "ascii").copy(terminal, tailOffset + 35);
  terminal.writeUInt32LE(wireObjectOffset, tailOffset + 77);

  const dsn = Buffer.concat([dsnPrefix, wire, terminal]);
  const result = inspectProteusSchematicBytes(dsn);

  assert.equal(result.terminalPlacements.length, 1);
  assert.deepEqual(result.terminalPlacements[0], {
    sourceOffset: wireObjectOffset + wire.length,
    byteLength: 105,
    kind: "POWER",
    origin: { x: 100, y: 100 },
    labelAnchor: { x: 0, y: 300 },
    connectionPoint: { x: 100, y: 0 },
    wireObjectOffset,
    wireReferenceValid: true,
    connectionPointMatchesWire: true,
  });
  assert.deepEqual(result.wireConnectedGroups, [
    {
      wireObjectOffsets: [wireObjectOffset],
      junctionNodeOffsets: [],
      componentPins: [],
      terminals: [{
        sourceOffset: wireObjectOffset + wire.length,
        kind: "POWER",
        connectionPointMatchesWire: true,
      }],
    },
  ]);
});


test("New Wave: mantiene separados los dos archivos de referencia y valida los campos documentales", () => {
  const livewireBytes = fixture("Mathelecprueba.lvw");
  const pcbWizardBytes = fixture("Mathelecprueba.pcb");
  assert.equal(livewireBytes.length, 1144);
  assert.equal(pcbWizardBytes.length, 1093);
  assert.deepEqual([...livewireBytes.subarray(0, 4)], [0x44, 0x73, 0x67, 0x00]);
  assert.deepEqual([...pcbWizardBytes.subarray(0, 4)], [0x44, 0x73, 0x67, 0x00]);

  let commonPrefixLength = 0;
  const sharedLength = Math.min(livewireBytes.length, pcbWizardBytes.length);
  while (
    commonPrefixLength < sharedLength &&
    livewireBytes[commonPrefixLength] === pcbWizardBytes[commonPrefixLength]
  ) {
    commonPrefixLength += 1;
  }
  assert.equal(commonPrefixLength, 38);
  assert.notEqual(livewireBytes[commonPrefixLength], pcbWizardBytes[commonPrefixLength]);

  for (const [fileName, bytes] of [
    ["Mathelecprueba.lvw", livewireBytes],
    ["Mathelecprueba.pcb", pcbWizardBytes],
  ] as const) {
    const result = inspectNativeEdaProject(fileName, bytes);
    if (result.format === "proteus") {
      throw new Error("La fixture New Wave se clasificó inesperadamente como Proteus.");
    }
    assert.deepEqual(result.textFields, [
      {
        marker: "page &p of &n",
        offset: 90,
        lengthPrefixOffset: 89,
        declaredLength: 13,
        decodedLength: 13,
        status: "length-prefix-validated",
      },
      {
        marker: "Arial",
        offset: 104,
        lengthPrefixOffset: 103,
        declaredLength: 5,
        decodedLength: 5,
        status: "length-prefix-validated",
      },
    ]);
    assert.equal(result.componentDataDecoded, false);
  }
});


test("Proteus DSN: verifica el orden y la geometría física de patas mediante una definición $PIN", () => {
  const bytes = (...parts: Buffer[]) => Buffer.concat(parts);
  const labelBlock = (
    text: string,
    attribute: string,
    anchor: { x: number; y: number },
  ) => {
    const textBytes = Buffer.from(text, "ascii");
    return bytes(
      Buffer.from([0xff, textBytes.length]),
      textBytes,
      (() => {
        const result = Buffer.alloc(8);
        result.writeInt32LE(anchor.x * 2540, 0);
        result.writeInt32LE(anchor.y * 2540, 4);
        return result;
      })(),
      Buffer.alloc(26),
      Buffer.from("Default Font\0", "ascii"),
      Buffer.from(attribute + "\0", "ascii"),
      Buffer.alloc(4),
    );
  };
  const wire = (points: Array<[number, number]>) => {
    const header = Buffer.from([
      0x00, 0x1d, 0x00, 0x00, 0x00,
      0x00, 0xc0, 0x9e, 0x00, 0x00,
      0x00, 0x40, 0x00,
      0x00, 0x01, 0xff, 0xff, 0xff, 0x00, 0xff, 0xff, 0xff, 0x00,
      0x02, 0x7f, 0x57, 0x49, 0x52, 0x45, 0x00, 0x00, 0x00,
      0x00, 0x00,
    ]);
    header.writeUInt16LE(points.length, 32);
    const vertices = Buffer.alloc(points.length * 8);
    points.forEach(([x, y], index) => {
      vertices.writeInt32LE(x * 2540, index * 8);
      vertices.writeInt32LE(y * 2540, index * 8 + 4);
    });
    return bytes(header, vertices);
  };
  const pinRecord = (name: string, number: string, x: number, y: number) => {
    const marker = Buffer.from("$PINDEFAULT\0", "ascii");
    const prefix = Buffer.alloc(16);
    prefix.writeUInt32LE(0, 0);
    prefix.writeInt32LE(x * 2540, 4);
    prefix.writeInt32LE(y * 2540, 8);
    return bytes(
      prefix,
      marker,
      Buffer.from(name + "\0", "ascii"),
      Buffer.from(number + "\0", "ascii"),
    );
  };

  // The embedded symbol order is B then A, deliberately different from CDB.
  const symbolBody = bytes(
    Buffer.alloc(16),
    pinRecord("B", "2", 100, 0),
    pinRecord("A", "1", -100, 0),
  );
  const device = Buffer.from("RESISTOR", "ascii");
  const deviceTag = Buffer.alloc(2 + device.length);
  deviceTag.writeUInt16LE(device.length, 0);
  device.copy(deviceTag, 2);
  const symbolHeader = bytes(
    deviceTag,
    (() => {
      const timestamp = Buffer.alloc(4);
      timestamp.writeUInt32LE(0x50000000, 0);
      return timestamp;
    })(),
    Buffer.alloc(9),
    (() => {
      const length = Buffer.alloc(4);
      length.writeUInt32LE(symbolBody.length + 4, 0);
      return length;
    })(),
  );
  const librarySection = bytes(
    symbolHeader,
    symbolBody,
    Buffer.from([0xff]),
    Buffer.from("ISIS CIRCUIT FILE", "ascii"),
  );

  const fixedHeader = bytes(
    Buffer.from("ISIS SCHEMATIC FILE", "ascii"),
    Buffer.alloc(8),
    librarySection,
    Buffer.from("OBJECT DATA\0", "ascii"),
  );
  const wireA = wire([[-200, 0], [-300, 0]]);
  const wireB = wire([[200, 0], [300, 0]]);
  const wireAOffset = fixedHeader.length;
  const wireBOffset = wireAOffset + wireA.length;

  const labels = bytes(
    labelBlock("U1", "COMPONENT ID", { x: 0, y: 0 }),
    labelBlock("100R", "COMPONENT VALUE", { x: 0, y: 0 }),
    labelBlock("RESISTOR", "DEVICE", { x: 0, y: 0 }),
    labelBlock("{PRIMTYPE=RESISTOR}", "PROPERTIES", { x: 0, y: 0 }),
  );
  const propertiesLength = Buffer.alloc(4);
  propertiesLength.writeUInt32LE("{PRIMTYPE=RESISTOR}".length, 0);
  const componentHeader = Buffer.alloc(3 + device.length + 8 + 17 + 8);
  componentHeader.writeUInt16LE(2, 0);
  componentHeader[2] = device.length;
  device.copy(componentHeader, 3);
  const originOffset = 3 + device.length;
  componentHeader.writeInt32LE(0, originOffset);
  componentHeader.writeInt32LE(0, originOffset + 4);
  const slotTableOffset = originOffset + 8 + 17;
  componentHeader.writeUInt32LE(wireBOffset, slotTableOffset);
  componentHeader.writeUInt32LE(wireAOffset, slotTableOffset + 4);
  const componentRecord = bytes(labels, propertiesLength, componentHeader);
  const dsn = bytes(fixedHeader, wireA, wireB, componentRecord);

  const result = inspectProteusSchematicBytes(dsn, [{
    reference: "U1",
    value: "100R",
    device: "RESISTOR",
    package: "RES",
    properties: {},
    pinEntryOffset: null,
    pinEntryStatus: "decoded",
    pins: [
      { name: "A", number: "1" },
      { name: "B", number: "2" },
    ],
  }]);

  const component = result.componentInstances[0];
  assert.equal(result.componentInstanceCount, 1, JSON.stringify({
    objectDataSectionCount: result.objectDataSectionCount,
    componentIdMarkersOutsideObjectData: result.componentIdMarkersOutsideObjectData,
    unresolvedObjects: result.unresolvedObjects,
    componentInstances: result.componentInstances,
    wireSegments: result.wireSegments,
    symbolDefinitionDiagnostics: component?.symbolDefinitionDiagnostics,
  }));
  assert.equal(component.componentRecordParseStatus, "decoded");
  assert.equal(component.placement?.device, "RESISTOR");
  assert.equal(component.placement?.pinCount, 2);
  assert.equal(component.pinSlotMappingStatus, "matched-by-symbol-geometry");
  assert.deepEqual(component.symbolDefinition?.pins.map((pin) => ({
    name: pin.name,
    number: pin.number,
    base: pin.base,
    direction: pin.direction,
  })), [
    { name: "B", number: "2", base: { x: 100, y: 0 }, direction: { x: 1, y: 0 } },
    { name: "A", number: "1", base: { x: -100, y: 0 }, direction: { x: -1, y: 0 } },
  ]);
  assert.deepEqual(component.pinConnections.map((pin) => ({
    slotIndex: pin.slotIndex,
    pinName: pin.pinName,
    mappingBasis: pin.mappingBasis,
    wireObjectOffset: pin.wireObjectOffset,
    symbolRoot: pin.symbolRoot,
    connectionPoint: pin.connectionPoint,
    connectionPointMatchesWire: pin.connectionPointMatchesWire,
  })), [
    {
      slotIndex: 0,
      pinName: "B",
      mappingBasis: "symbol-pin-name",
      wireObjectOffset: wireBOffset,
      symbolRoot: { x: 100, y: 0 },
      connectionPoint: { x: 200, y: 0 },
      connectionPointMatchesWire: true,
    },
    {
      slotIndex: 1,
      pinName: "A",
      mappingBasis: "symbol-pin-name",
      wireObjectOffset: wireAOffset,
      symbolRoot: { x: -100, y: 0 },
      connectionPoint: { x: -200, y: 0 },
      connectionPointMatchesWire: true,
    },
  ]);

  // Repeat with the component mirrored and rotated by 90 degrees. The CDB
  // slot pointers are swapped to follow the transformed physical endpoints.
  const rotatedWireA = wire([[0, -200], [0, -300]]);
  const rotatedWireB = wire([[0, 200], [0, 300]]);
  const rotatedComponentRecord = Buffer.from(componentRecord);
  const componentHeaderOffset = labels.length + propertiesLength.length;
  const rotationOffset = componentHeaderOffset + originOffset + 8;
  rotatedComponentRecord.writeInt16LE(900, rotationOffset);
  rotatedComponentRecord.writeUInt16LE(1, rotationOffset + 2);
  rotatedComponentRecord.writeUInt32LE(wireAOffset, componentHeaderOffset + slotTableOffset);
  rotatedComponentRecord.writeUInt32LE(wireBOffset, componentHeaderOffset + slotTableOffset + 4);
  const rotatedDsn = bytes(fixedHeader, rotatedWireA, rotatedWireB, rotatedComponentRecord);
  const rotatedResult = inspectProteusSchematicBytes(rotatedDsn, [{
    reference: "U1",
    value: "100R",
    device: "RESISTOR",
    package: "RES",
    properties: {},
    pinEntryOffset: null,
    pinEntryStatus: "decoded",
    pins: [
      { name: "A", number: "1" },
      { name: "B", number: "2" },
    ],
  }]);
  const rotatedComponent = rotatedResult.componentInstances[0];
  assert.equal(rotatedComponent.placement?.rotationDegrees, 90);
  assert.equal(rotatedComponent.placement?.mirrorFlag, 1);
  assert.equal(rotatedComponent.pinSlotMappingStatus, "matched-by-symbol-geometry");
  assert.deepEqual(rotatedComponent.pinConnections.map((pin) => ({
    pinName: pin.pinName,
    wireObjectOffset: pin.wireObjectOffset,
    symbolRoot: pin.symbolRoot,
    connectionPoint: pin.connectionPoint,
    connectionPointMatchesWire: pin.connectionPointMatchesWire,
  })), [
    {
      pinName: "B",
      wireObjectOffset: wireAOffset,
      symbolRoot: { x: 0, y: -100 },
      connectionPoint: { x: 0, y: -200 },
      connectionPointMatchesWire: true,
    },
    {
      pinName: "A",
      wireObjectOffset: wireBOffset,
      symbolRoot: { x: 0, y: 100 },
      connectionPoint: { x: 0, y: 200 },
      connectionPointMatchesWire: true,
    },
  ]);

});


test("New Wave: registra las tres muestras de Livewire y PCB Wizard y sus variantes binarias", () => {
  const fixtureSets = [
    {
      format: "livewire",
      fileNames: ["Mathelecprueba.lvw", "Mathelecprueba2a.lvw", "Mathelecprueba2b.lvw"],
      expectedLengths: [1144, 1462, 1616],
    },
    {
      format: "pcb-wizard",
      fileNames: ["Mathelecprueba.pcb", "Mathelecprueba2a.pcb", "Mathelecprueba2b.pcb"],
      expectedLengths: [1093, 1428, 1428],
    },
  ] as const;

  for (const set of fixtureSets) {
    const files = set.fileNames.map((name) => fixture(name));
    assert.deepEqual(files.map((file) => file.length), set.expectedLengths);
    assert.ok(files.every((file) => file.subarray(0, 4).equals(Buffer.from([0x44, 0x73, 0x67, 0x00]))));
    assert.ok(!files[0].equals(files[1]));
    assert.ok(!files[0].equals(files[2]));
    assert.ok(!files[1].equals(files[2]));

    for (const [index, file] of files.entries()) {
      const result = inspectNativeEdaProject(set.fileNames[index], file);
      assert.equal(result.format, set.format);
      assert.equal(result.componentDataDecoded, false);
      assert.deepEqual(result.textFields.map(({ marker, offset, declaredLength, status }) => ({
        marker, offset, declaredLength, status,
      })), [
        { marker: "page &p of &n", offset: 90, declaredLength: 13, status: "length-prefix-validated" },
        { marker: "Arial", offset: 104, declaredLength: 5, status: "length-prefix-validated" },
      ]);
    }
  }

  const livewireFiles = [
    fixture("Mathelecprueba.lvw"),
    fixture("Mathelecprueba2a.lvw"),
    fixture("Mathelecprueba2b.lvw"),
  ];
  for (const bytes of livewireFiles.slice(1)) {
    assert.deepEqual(bytes.subarray(41, 272), livewireFiles[0].subarray(41, 272));
  }

  const pcb2a = fixture("Mathelecprueba2a.pcb");
  const pcb2b = fixture("Mathelecprueba2b.pcb");
  assert.equal(pcb2a.length, 1428);
  assert.equal(pcb2b.length, 1428);
  assert.deepEqual(pcb2a.subarray(0, 921), pcb2b.subarray(0, 921));
  assert.deepEqual(pcb2a.subarray(1241), pcb2b.subarray(1241));
  assert.notDeepEqual(pcb2a.subarray(921, 1241), pcb2b.subarray(921, 1241));
});

test("New Wave: conserva tokens ASCII prefijados como evidencia sin clasificarlos como componentes", () => {
  const cases = [
    {
      fileName: "Mathelecprueba.pcb",
      fields: [[302, "B"], [304, "9V"], [450, "R"], [452, "1K"], [598, "D"]],
    },
    {
      fileName: "Mathelecprueba2a.pcb",
      fields: [[331, "B"], [333, "9V"], [479, "R"], [481, "1K"], [627, "D"], [773, "SW"]],
    },
    {
      fileName: "Mathelecprueba2b.pcb",
      fields: [[331, "B"], [333, "9V"], [479, "R"], [481, "1K"], [627, "D"], [773, "SW"]],
    },
    {
      fileName: "Mathelecprueba.lvw",
      fields: [[459, "1K"]],
    },
  ] as const;

  for (const sample of cases) {
    const bytes = fixture(sample.fileName);
    for (const [offset, expectedText] of sample.fields) {
      const length = bytes[offset];
      assert.equal(length, expectedText.length);
      assert.equal(bytes.toString("ascii", offset + 1, offset + 1 + length), expectedText);
    }
  }
});


test("Proteus 8.13: verifica componentes, movimiento, conexiones y objetos sin designador en las tres muestras", () => {
  const fileNames = [
    "mathelecprueba.pdsprj",
    "mathelecprueba2a.pdsprj",
    "mathelecprueba2b.pdsprj",
  ] as const;
  const expected = [
    {
      bytes: 12281,
      wireCount: 6,
      junctionCount: 2,
      wireGroupSizes: [3, 3],
      unresolvedLibraries: [],
      origins: [
        { reference: "B1", x: -4000, y: 400 },
        { reference: "D1", x: -3200, y: 400 },
        { reference: "R1", x: -2500, y: 300 },
      ],
    },
    {
      bytes: 12756,
      wireCount: 10,
      junctionCount: 4,
      wireGroupSizes: [5, 5],
      unresolvedLibraries: ["SWITCH"],
      origins: [
        { reference: "B1", x: -4000, y: 400 },
        { reference: "D1", x: -3200, y: 400 },
        { reference: "R1", x: -2500, y: 300 },
      ],
    },
    {
      bytes: 12766,
      wireCount: 10,
      junctionCount: 4,
      wireGroupSizes: [5, 5],
      unresolvedLibraries: ["SWITCH"],
      origins: [
        { reference: "B1", x: -4100, y: 400 },
        { reference: "D1", x: -2900, y: 400 },
        { reference: "R1", x: -2400, y: 300 },
      ],
    },
  ] as const;

  for (const [index, fileName] of fileNames.entries()) {
    const result = inspectNativeEdaProject(fileName, fixture(fileName));
    assert.equal(result.format, "proteus");
    assert.equal(result.byteLength, expected[index].bytes);
    assert.equal(result.hasProjectXml, true);
    assert.equal(result.hasRootDsn, true);
    assert.equal(result.hasRootCdb, true);
    assert.equal(result.componentMetadata.count, 3);
    assert.equal(result.schematicComponents.componentInstanceCount, 3);
    assert.equal(result.schematicComponents.wireSegments.length, expected[index].wireCount);
    assert.equal(result.schematicComponents.junctionNodes.length, expected[index].junctionCount);
    assert.deepEqual(
      result.schematicComponents.wireTouchGroups.map((group) => group.wireObjectOffsets.length),
      expected[index].wireGroupSizes,
    );
    assert.deepEqual(
      result.schematicComponents.componentInstances.map((instance) => ({
        reference: instance.reference,
        x: instance.placement?.origin.x,
        y: instance.placement?.origin.y,
      })),
      expected[index].origins,
    );
    assert.deepEqual(
      result.schematicComponents.unresolvedObjects.map((object) => object.libraryName),
      expected[index].unresolvedLibraries,
    );

    if (expected[index].unresolvedLibraries.includes("SWITCH")) {
      const unresolvedSwitch = result.schematicComponents.unresolvedObjects.find(
        (object) => object.libraryName === "SWITCH",
      );
      assert.ok(unresolvedSwitch);
      assert.equal(unresolvedSwitch.reference, null);
      assert.equal(unresolvedSwitch.reason, "missing-reference-designator");
      assert.equal(unresolvedSwitch.componentRecordParseStatus, "decoded");
      assert.equal(unresolvedSwitch.placement?.device, "SWITCH");
      assert.equal(unresolvedSwitch.placement?.pinCount, 2);
      assert.ok(unresolvedSwitch.recordStartOffset !== null);
      assert.equal(unresolvedSwitch.wireAddressReferences.length, 2);
      assert.ok(unresolvedSwitch.wireAddressReferences.every((pointer) => wireOffsets.has(pointer.wireObjectOffset)));
    }
    assert.equal(result.schematicComponents.terminalPlacements.length, 0);

    const wireOffsets = new Set(result.schematicComponents.wireSegments.map((wire) => wire.objectOffset));
    for (const component of result.schematicComponents.componentInstances) {
      assert.equal(component.pinSlotMappingStatus, "slot-table-valid-symbol-order-unverified");
      assert.equal(component.wireAddressReferences.length, 2);
      assert.ok(component.wireAddressReferences.every((pointer) => wireOffsets.has(pointer.wireObjectOffset)));
      assert.ok(component.pinConnections.every((pin) => pin.mappingBasis === "cdb-order-unverified"));
    }
    assert.ok(result.componentMetadata.components.every((component) => component.pinEntryStatus === "decoded"));
  }

  const variant2a = inspectNativeEdaProject(fileNames[1], fixture(fileNames[1]));
  const variant2b = inspectNativeEdaProject(fileNames[2], fixture(fileNames[2]));
  if (variant2a.format !== "proteus" || variant2b.format !== "proteus") {
    throw new Error("Las variantes Proteus se clasificaron con un formato inesperado.");
  }

  assert.ok(variant2a.schematicComponents.wireSegments.some((wire) =>
    JSON.stringify(wire.points) === JSON.stringify([{ x: -4000, y: 700 }, { x: -3600, y: 700 }]),
  ));
  assert.ok(variant2b.schematicComponents.wireSegments.some((wire) =>
    JSON.stringify(wire.points) === JSON.stringify([
      { x: -2900, y: 600 },
      { x: -2900, y: 800 },
      { x: -3300, y: 800 },
      { x: -3300, y: 600 },
      { x: -3200, y: 600 },
    ]),
  ));
});
