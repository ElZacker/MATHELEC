import { inflateRawSync } from "node:zlib";
import { getNativeEdaCompatibilityProfile } from "./compatibility-matrix";
import type { NativeEdaFormat } from "./compatibility-matrix";
export type { NativeEdaFormat } from "./compatibility-matrix";

export type TargetApplicationContext = {
  application: string;
  installedVersion: string;
  versionSource: "user-confirmed";
  fileVersionDetected: false;
};

function getTargetApplicationContext(format: NativeEdaFormat): TargetApplicationContext {
  const profile = getNativeEdaCompatibilityProfile(format);
  return {
    application: profile.application,
    installedVersion: profile.installedVersion,
    versionSource: profile.versionSource,
    fileVersionDetected: false,
  };
}

export type NewWaveTextField = {
  marker: string;
  offset: number;
  lengthPrefixOffset: number | null;
  declaredLength: number | null;
  decodedLength: number;
  status: "length-prefix-validated" | "marker-only";
};

export type NewWaveInspection = {
  format: "livewire" | "pcb-wizard";
  targetApplication: TargetApplicationContext;
  recognized: true;
  byteLength: number;
  signature: "Dsg\\0";
  formatIdentification: {
    family: "New Wave Dsg";
    selectedBy: "file-extension";
    confidence: "shared-family-signature-plus-extension";
    applicationSpecificSignatureVerified: false;
  };
  textMarkers: string[];
  textMarkerOffsets: Array<{ marker: string; offset: number }>;
  textFields: NewWaveTextField[];
  status: "recognized-binary-not-yet-decoded";
  componentDataDecoded: false;
  limitations: string[];
};

export type ProteusZipEntry = {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  crc32: string;
};

export type ProteusComponentPinMetadata = {
  name: string;
  number: string;
};

export type ProteusComponentMetadata = {
  reference: string;
  value: string;
  device: string;
  package: string;
  properties: Record<string, string>;
  pinEntryOffset: number | null;
  pinEntryStatus: "decoded" | "unavailable" | "ambiguous";
  pins: ProteusComponentPinMetadata[];
};

export type ProteusComponentMetadataInspection = {
  status: "partial" | "unavailable";
  source: "ROOT.CDB" | null;
  count: number;
  components: ProteusComponentMetadata[];
  limitations: string[];
};

export type ProteusSchematicWireAddressReference = {
  byteOffset: number;
  wireObjectOffset: number;
};

export type ProteusSchematicPinConnection = {
  slotIndex: number;
  pinName: string;
  pinNumber: string;
  mappingBasis: "symbol-pin-name" | "cdb-order-unverified";
  wireObjectOffset: number | null;
  symbolRoot: { x: number; y: number } | null;
  connectionPoint: { x: number; y: number } | null;
  connectionPointMatchesWire: boolean | null;
};

export type ProteusSchematicSymbolPin = {
  name: string;
  number: string;
  hidden: boolean;
  base: { x: number; y: number };
  direction: { x: number; y: number };
};

export type ProteusSchematicSymbolDefinition = {
  offset: number;
  byteLength: number;
  pins: ProteusSchematicSymbolPin[];
};

export type ProteusSchematicLabelBlock = {
  text: string;
  attribute: string;
  anchor: { x: number; y: number };
  rawAnchor: { x: number; y: number };
  styleBytesHex: string;
  tailBytesHex: string;
};

export type ProteusSchematicComponentPlacement = {
  device: string;
  pinCount: number;
  origin: { x: number; y: number };
  rawOrigin: { x: number; y: number };
  rotationDegrees: number;
  mirrorFlag: number;
  orientationBytesHex: string;
  pinSlotTableOffset: number;
  pinSlotAddresses: number[];
  propertiesPayloadLength: number;
  propertiesPayloadOffset: number | null;
  propertiesPayloadEmbeddedInLabel: boolean;
  labelBlocks: ProteusSchematicLabelBlock[];
};

export type ProteusSchematicComponentInstance = {
  reference: string;
  recordStartOffset: number;
  sourceOffset: number;
  componentRecordParseStatus: "decoded" | "not-found" | "ambiguous";
  componentRecordCandidateOffsets: number[];
  componentRecordDiagnostics: string[];
  placement: ProteusSchematicComponentPlacement | null;
  value: string | null;
  libraryName: string | null;
  libraryNameMatchesDeviceMetadata: boolean | null;
  wireAddressReferences: ProteusSchematicWireAddressReference[];
  pinSlotTableOffset: number | null;
  pinSlotMappingStatus:
    | "matched-by-symbol-geometry"
    | "slot-table-valid-symbol-order-unverified"
    | "symbol-geometry-mismatch"
    | "count-mismatch"
    | "unavailable"
    | "ambiguous";
  symbolDefinition: ProteusSchematicSymbolDefinition | null;
  symbolDefinitionDiagnostics: string[];
  pinConnections: ProteusSchematicPinConnection[];
  properties: Record<string, string>;
  matchesComponentMetadata: boolean;
};

export type ProteusSchematicUnresolvedObject = {
  sourceOffset: number;
  reference: string | null;
  value: string | null;
  libraryName: string | null;
  reason: "missing-reference-designator" | "duplicate-reference";
};

export type ProteusSchematicMarkerSpan = {
  offset: number;
  byteWindowLength: number;
  nextBoundary: "wire-marker" | "object-data-marker" | "end-of-file";
};

export type ProteusSchematicWireSegment = {
  objectOffset: number;
  markerOffset: number;
  byteLength: number;
  vertexCount: number;
  points: Array<{ x: number; y: number }>;
  rawPoints: Array<{ x: number; y: number }>;
};

export type ProteusSchematicWireTouchGroup = {
  wireObjectOffsets: number[];
};

export type ProteusSchematicJunctionNode = {
  objectOffset: number;
  x: number;
  y: number;
  rawX: number;
  rawY: number;
  wireObjectOffsets: number[];
};

export type ProteusSchematicTerminalPlacement = {
  sourceOffset: number;
  byteLength: number;
  kind: "POWER" | "GROUND";
  origin: { x: number; y: number };
  labelAnchor: { x: number; y: number };
  connectionPoint: { x: number; y: number };
  wireObjectOffset: number | null;
  wireReferenceValid: boolean | null;
  connectionPointMatchesWire: boolean | null;
};

export type ProteusSchematicWireConnectedGroup = {
  wireObjectOffsets: number[];
  junctionNodeOffsets: number[];
  componentPins: Array<{
    reference: string;
    slotIndex: number;
    pinName: string;
    pinNumber: string;
    mappingBasis: "symbol-pin-name" | "cdb-order-unverified";
    connectionPointMatchesWire: boolean | null;
  }>;
  terminals: Array<{
    sourceOffset: number;
    kind: "POWER" | "GROUND";
    connectionPointMatchesWire: boolean | null;
  }>;
};

export type ProteusSchematicInspection = {
  status: "partial" | "unavailable";
  source: "ROOT.DSN";
  header: "ISIS SCHEMATIC FILE";
  objectDataSectionCount: number;
  componentIdMarkersOutsideObjectData: number;
  wireMarkerOffsets: number[];
  wireMarkerSpans: ProteusSchematicMarkerSpan[];
  wireSegments: ProteusSchematicWireSegment[];
  unresolvedWireMarkerOffsets: number[];
  wireTouchGroups: ProteusSchematicWireTouchGroup[];
  junctionNodes: ProteusSchematicJunctionNode[];
  terminalPlacements: ProteusSchematicTerminalPlacement[];
  wireConnectedGroups: ProteusSchematicWireConnectedGroup[];
  terminalMarkerOffsets: number[];
  terminalLabelMarkerOffsets: number[];
  propertiesMarkerOffsets: number[];
  componentInstanceCount: number;
  componentInstances: ProteusSchematicComponentInstance[];
  unresolvedObjectCount: number;
  unresolvedObjects: ProteusSchematicUnresolvedObject[];
  componentReferencesWithoutMetadata: string[];
  metadataReferencesWithoutSchematicInstance: string[];
  componentLibraryNamesWithoutDeviceMetadataMatch: string[];
  limitations: string[];
};

export type ProteusInspection = {
  format: "proteus";
  targetApplication: TargetApplicationContext;
  recognized: true;
  byteLength: number;
  container: "zip";
  entries: ProteusZipEntry[];
  hasProjectXml: boolean;
  hasRootDsn: boolean;
  hasRootCdb: boolean;
  projectXmlBytes: number | null;
  componentMetadata: ProteusComponentMetadataInspection;
  schematicComponents: ProteusSchematicInspection;
  status: "recognized-project-with-partial-schematic-data";
  schematicDecoded: false;
  limitations: string[];
};

export type NativeEdaInspection = NewWaveInspection | ProteusInspection;

const NEW_WAVE_MAGIC = Buffer.from([0x44, 0x73, 0x67, 0x00]);
const ZIP_LOCAL_HEADER = 0x04034b50;
const ZIP_CENTRAL_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const MAX_ZIP_COMMENT = 0xffff;
const MIN_ZIP_EOCD_SIZE = 22;
const MAX_ZIP_ENTRIES = 256;
const MAX_ENTRY_UNCOMPRESSED_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;
const MAX_PROJECT_XML_BYTES = 2 * 1024 * 1024;

function requireRange(buffer: Buffer, offset: number, length: number, label: string): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > buffer.length) {
    throw new Error(`El archivo Proteus está truncado o tiene un desplazamiento inválido (${label}).`);
  }
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minimum = Math.max(0, buffer.length - MIN_ZIP_EOCD_SIZE - MAX_ZIP_COMMENT);
  for (let offset = buffer.length - MIN_ZIP_EOCD_SIZE; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== ZIP_END_OF_CENTRAL_DIRECTORY) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + MIN_ZIP_EOCD_SIZE + commentLength === buffer.length) return offset;
  }
  throw new Error("El archivo no contiene un directorio ZIP válido de Proteus.");
}

function parseZipDirectory(buffer: Buffer): ProteusZipEntry[] {
  if (buffer.length < MIN_ZIP_EOCD_SIZE) {
    throw new Error("El archivo Proteus es demasiado pequeño para ser un proyecto ZIP.");
  }

  const eocdOffset = findEndOfCentralDirectory(buffer);
  const diskNumber = buffer.readUInt16LE(eocdOffset + 4);
  const centralDirectoryDisk = buffer.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(eocdOffset + 8);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (entryCount > MAX_ZIP_ENTRIES) {
    throw new Error(`El proyecto Proteus contiene demasiadas entradas ZIP (máximo ${MAX_ZIP_ENTRIES}).`);
  }
  if (diskNumber !== 0 || centralDirectoryDisk !== 0 || entriesOnDisk !== entryCount) {
    throw new Error("No se admiten proyectos Proteus ZIP divididos en varios volúmenes.");
  }
  if (
    entryCount === 0xffff ||
    centralDirectoryOffset === 0xffffffff ||
    centralDirectorySize === 0xffffffff
  ) {
    throw new Error("El proyecto Proteus usa ZIP64, todavía no compatible con este lector.");
  }
  requireRange(buffer, centralDirectoryOffset, centralDirectorySize, "directorio central");
  if (centralDirectoryOffset + centralDirectorySize > eocdOffset) {
    throw new Error("El directorio central ZIP ocupa una región inválida.");
  }

  const entries: ProteusZipEntry[] = [];
  const seenNames = new Set<string>();
  let offset = centralDirectoryOffset;
  let totalUncompressedSize = 0;

  for (let index = 0; index < entryCount; index += 1) {
    requireRange(buffer, offset, 46, "cabecera del directorio central");
    if (buffer.readUInt32LE(offset) !== ZIP_CENTRAL_HEADER) {
      throw new Error(`Entrada ZIP ${index + 1}: firma de directorio central inválida.`);
    }

    const flags = buffer.readUInt16LE(offset + 8);
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const crc = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const diskStart = buffer.readUInt16LE(offset + 34);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);

    requireRange(buffer, offset + 46, nameLength + extraLength + commentLength, "nombre y metadatos ZIP");
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (!name || name.includes("\\") || name.startsWith("/") || name.split("/").includes("..")) {
      throw new Error("El proyecto Proteus contiene un nombre de entrada ZIP inseguro o inválido.");
    }
    if (seenNames.has(name.toLowerCase())) {
      throw new Error(`El proyecto Proteus contiene dos entradas con el mismo nombre: ${name}.`);
    }
    seenNames.add(name.toLowerCase());

    if ((flags & 0x0001) !== 0) {
      throw new Error(`La entrada protegida ${name} está cifrada y no se puede inspeccionar.`);
    }
    if (diskStart !== 0 || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
      throw new Error(`La entrada ${name} usa una característica ZIP todavía no compatible.`);
    }
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      throw new Error(`La entrada ${name} usa el método de compresión ${compressionMethod}, no compatible.`);
    }
    if (uncompressedSize > MAX_ENTRY_UNCOMPRESSED_BYTES) {
      throw new Error(`La entrada ${name} supera el límite de descompresión de 16 MB.`);
    }
    totalUncompressedSize += uncompressedSize;
    if (totalUncompressedSize > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new Error("El contenido total del ZIP supera el límite de descompresión de 32 MB.");
    }

    requireRange(buffer, localHeaderOffset, 30, `cabecera local de ${name}`);
    if (buffer.readUInt32LE(localHeaderOffset) !== ZIP_LOCAL_HEADER) {
      throw new Error(`La entrada ${name} no tiene una cabecera local ZIP válida.`);
    }
    const localFlags = buffer.readUInt16LE(localHeaderOffset + 6);
    const localMethod = buffer.readUInt16LE(localHeaderOffset + 8);
    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    requireRange(buffer, localHeaderOffset + 30, localNameLength + localExtraLength, `metadatos locales de ${name}`);
    const localName = buffer.subarray(localHeaderOffset + 30, localHeaderOffset + 30 + localNameLength).toString("utf8");
    if (localName !== name || localMethod !== compressionMethod || (localFlags & 0x0001) !== 0) {
      throw new Error(`La cabecera local de ${name} no coincide con el directorio central.`);
    }
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    requireRange(buffer, dataOffset, compressedSize, `datos comprimidos de ${name}`);
    if (dataOffset + compressedSize > centralDirectoryOffset) {
      throw new Error(`Los datos de ${name} invaden el directorio central ZIP.`);
    }

    entries.push({
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      crc32: crc.toString(16).padStart(8, "0"),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  if (offset !== centralDirectoryOffset + centralDirectorySize) {
    throw new Error("El tamaño del directorio central no coincide con sus entradas.");
  }
  return entries;
}

function extractZipEntry(buffer: Buffer, entry: ProteusZipEntry): Buffer {
  const entries = parseZipDirectory(buffer);
  const centralIndex = entries.findIndex((candidate) => candidate.name === entry.name);
  if (centralIndex < 0) throw new Error(`No existe la entrada ZIP ${entry.name}.`);

  const eocdOffset = findEndOfCentralDirectory(buffer);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  let cursor = centralOffset;
  for (let index = 0; index < centralIndex; index += 1) {
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
  const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
  const compressed = buffer.subarray(dataOffset, dataOffset + entry.compressedSize);
  if (entry.uncompressedSize > MAX_ENTRY_UNCOMPRESSED_BYTES) {
    throw new Error(`La entrada ${entry.name} supera el límite de descompresión de 16 MB.`);
  }
  const data = entry.compressionMethod === 0
    ? Buffer.from(compressed)
    : inflateRawSync(compressed, { maxOutputLength: MAX_ENTRY_UNCOMPRESSED_BYTES });

  if (data.length !== entry.uncompressedSize) {
    throw new Error(`La entrada ${entry.name} no coincide con el tamaño descomprimido declarado.`);
  }
  const expectedCrc = Number.parseInt(entry.crc32, 16) >>> 0;
  if (crc32(data) !== expectedCrc) {
    throw new Error(`La entrada ${entry.name} no superó la comprobación CRC32.`);
  }
  return data;
}


/**
 * Recover the conservative, length-prefixed component metadata records found in
 * the ROOT.CDB fixture. The record table is not treated as a complete schematic:
 * placement, symbols, pin geometry and connectivity live elsewhere.
 *
 * The size field in the observed Proteus 8.13 sample spans a trailing NUL and
 * table bytes after the printable property block. We therefore stop properties
 * at the first NUL and keep the remainder opaque.
 */
/**
 * Reads a Proteus/ISIS string encoded as FF + one-byte length + ASCII bytes.
 * This helper intentionally rejects binary payloads instead of guessing a text value.
 */
function readProteusLengthPrefixedAscii(
  buffer: Buffer,
  offset: number,
  maxLength = 128,
): { value: string; next: number } | null {
  if (offset < 0 || offset + 2 > buffer.length || buffer[offset] !== 0xff) return null;
  const length = buffer[offset + 1];
  const end = offset + 2 + length;
  if (length === 0 || length > maxLength || end > buffer.length) return null;
  const raw = buffer.subarray(offset + 2, end);
  for (const byte of raw) {
    if (byte < 0x20 || byte > 0x7e) return null;
  }
  return { value: raw.toString("latin1"), next: end };
}

function findAllBufferOccurrences(buffer: Buffer, marker: Buffer): number[] {
  const offsets: number[] = [];
  let cursor = 0;
  while (cursor <= buffer.length - marker.length) {
    const found = buffer.indexOf(marker, cursor);
    if (found < 0) break;
    offsets.push(found);
    cursor = found + marker.length;
  }
  return offsets;
}

function isProteusDesignator(value: string): boolean {
  return /^[A-Za-z]{1,5}[0-9]{1,5}$/.test(value.trim());
}

function extractProteusProperties(text: string): Record<string, string> {
  const properties: Record<string, string> = {};
  for (const match of text.matchAll(/\{([^{}=\r\n]{1,64})=([^{}\r\n]{0,256})\}/g)) {
    const key = match[1].trim();
    if (!/^[A-Za-z][A-Za-z0-9_. -]*$/.test(key)) continue;
    if (!(key in properties)) properties[key] = match[2].trim();
  }
  return properties;
}

type ParsedProteusComponentRecord = {
  recordStartOffset: number;
  componentIdMarkerOffset: number;
  reference: string;
  value: string | null;
  placement: ProteusSchematicComponentPlacement;
};

type ProteusComponentRecordSearchResult = {
  record: ParsedProteusComponentRecord | null;
  candidateOffsets: number[];
  diagnostics: string[];
  ambiguous: boolean;
};

function parseProteusComponentRecordAt(
  buffer: Buffer,
  recordStartOffset: number,
  expectedComponentIdMarkerOffset: number,
  diagnostics: string[],
): ParsedProteusComponentRecord | null {
  const fail = (reason: string): null => {
    diagnostics.push(reason);
    return null;
  };
  let cursor = recordStartOffset;
  const labelBlocks: ProteusSchematicLabelBlock[] = [];

  for (let blockIndex = 0; blockIndex < 4; blockIndex += 1) {
    if (cursor + 2 > buffer.length || buffer[cursor] !== 0xff) {
      return fail(`label-${blockIndex}:missing-ff-header`);
    }
    // Placed-component label blocks in the supplied Proteus 8.13 fixture use
    // FF + one-byte text length (unlike some other ISIS data strings).
    const textLength = buffer[cursor + 1];
    if (
      (textLength < 1 && blockIndex !== 3) ||
      textLength > 128
    ) {
      return fail(`label-${blockIndex}:invalid-u8-length-${textLength}`);
    }
    const textStart = cursor + 2;
    const textEnd = textStart + textLength;
    const anchorOffset = textEnd;
    const styleOffset = anchorOffset + 8;
    const fontOffset = styleOffset + 26;
    const attributeOffset = fontOffset + 13;
    if (
      attributeOffset >= buffer.length ||
      !buffer.subarray(fontOffset, attributeOffset).equals(Buffer.from("Default Font\0", "ascii"))
    ) {
      return fail(`label-${blockIndex}:default-font-mismatch`);
    }
    const attributeEnd = buffer.indexOf(0, attributeOffset);
    if (
      attributeEnd < 0 ||
      attributeEnd > attributeOffset + 40 ||
      attributeEnd + 5 > buffer.length
    ) {
      return fail(`label-${blockIndex}:invalid-attribute-terminator`);
    }

    const textBytes = buffer.subarray(textStart, textEnd);
    const attributeBytes = buffer.subarray(attributeOffset, attributeEnd);
    // The PROPERTIES label contains line-separated brace records in actual
    // Proteus 8.13 saves; permit ASCII whitespace inside label text only.
    if (
      [...textBytes].some((byte) =>
        (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) || byte > 0x7e
      ) ||
      [...attributeBytes].some((byte) => byte < 0x20 || byte > 0x7e)
    ) {
      return fail(`label-${blockIndex}:non-printable-text-or-attribute`);
    }

    const rawX = buffer.readInt32LE(anchorOffset);
    const rawY = buffer.readInt32LE(anchorOffset + 4);
    labelBlocks.push({
      text: textBytes.toString("latin1"),
      attribute: attributeBytes.toString("latin1"),
      anchor: { x: rawX / 2540, y: rawY / 2540 },
      rawAnchor: { x: rawX, y: rawY },
      styleBytesHex: buffer.subarray(styleOffset, fontOffset).toString("hex"),
      tailBytesHex: buffer.subarray(attributeEnd + 1, attributeEnd + 5).toString("hex"),
    });
    cursor = attributeEnd + 5;
  }

  const componentIdBlock = labelBlocks[0];
  if (!componentIdBlock || componentIdBlock.attribute !== "COMPONENT ID") {
    return fail(`first-label-is-not-component-id:${componentIdBlock?.attribute ?? "missing"}`);
  }
  if (recordStartOffset < 0 || recordStartOffset > expectedComponentIdMarkerOffset) {
    return fail("component-id-marker-before-record-start");
  }
  const componentIdMarkerOffset = recordStartOffset +
    2 + componentIdBlock.text.length + 8 + 26 + 13;
  if (componentIdMarkerOffset !== expectedComponentIdMarkerOffset) {
    return fail(
      `component-id-marker-offset-mismatch:expected-${expectedComponentIdMarkerOffset}:got-${componentIdMarkerOffset}`,
    );
  }
  if (!isProteusDesignator(componentIdBlock.text)) {
    return fail(`invalid-component-designator:${componentIdBlock.text}`);
  }

  if (cursor + 4 > buffer.length) return fail("missing-properties-payload-length");
  const propertiesPayloadLength = buffer.readUInt32LE(cursor);
  const propertiesLabel = labelBlocks[3];
  const propertiesPayloadEmbeddedInLabel = propertiesPayloadLength === propertiesLabel.text.length;
  const propertiesPayloadOffset = propertiesPayloadEmbeddedInLabel ? null : cursor + 4;
  if (
    propertiesPayloadLength > 8192 ||
    (!propertiesPayloadEmbeddedInLabel &&
      (propertiesPayloadOffset === null ||
        propertiesPayloadOffset + propertiesPayloadLength > buffer.length))
  ) {
    return fail(`invalid-properties-payload-length:${propertiesPayloadLength}`);
  }
  if (!propertiesPayloadEmbeddedInLabel) {
    const propertiesPayload = buffer.subarray(
      propertiesPayloadOffset!,
      propertiesPayloadOffset! + propertiesPayloadLength,
    );
    if (
      !propertiesPayload.toString("latin1").startsWith("{") ||
      [...propertiesPayload].some((byte) =>
        (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) || byte > 0x7e
      )
    ) {
      return fail("properties-payload-is-not-printable-brace-text");
    }
  }

  const componentHeaderOffset = cursor + 4 +
    (propertiesPayloadEmbeddedInLabel ? 0 : propertiesPayloadLength);
  if (componentHeaderOffset + 3 > buffer.length) return fail("missing-component-device-header");
  const pinCount = buffer.readUInt16LE(componentHeaderOffset);
  // In the supplied Proteus 8.13 placed-component record, the device-name
  // length is a single byte following the u16 pin count.
  const deviceNameLength = buffer[componentHeaderOffset + 2];
  if (pinCount < 1 || pinCount > 300 || deviceNameLength < 1 || deviceNameLength > 60) {
    return fail(`invalid-pin-count-or-device-length:${pinCount}:${deviceNameLength}`);
  }
  const deviceStart = componentHeaderOffset + 3;
  const originOffset = deviceStart + deviceNameLength;
  const tailStart = originOffset + 8;
  const pinSlotTableOffset = tailStart + 17;
  const pinSlotArrayEnd = pinSlotTableOffset + pinCount * 4;
  if (pinSlotArrayEnd > buffer.length) return fail("component-pin-slot-array-out-of-range");
  const deviceBytes = buffer.subarray(deviceStart, originOffset);
  if ([...deviceBytes].some((byte) => byte < 0x20 || byte > 0x7e)) {
    return fail("component-device-name-not-printable");
  }

  const rawOrigin = {
    x: buffer.readInt32LE(originOffset),
    y: buffer.readInt32LE(originOffset + 4),
  };
  const rotationRaw = buffer.readInt16LE(tailStart);
  const mirrorFlag = buffer.readUInt16LE(tailStart + 2);
  const pinSlotAddresses = Array.from({ length: pinCount }, (_, index) =>
    buffer.readUInt32LE(pinSlotTableOffset + index * 4),
  );
  const labelValue = labelBlocks.find((block) => block.attribute === "COMPONENT VALUE")?.text ?? null;

  return {
    recordStartOffset,
    componentIdMarkerOffset,
    reference: componentIdBlock.text,
    value: labelValue,
    placement: {
      device: deviceBytes.toString("latin1"),
      pinCount,
      origin: { x: rawOrigin.x / 2540, y: rawOrigin.y / 2540 },
      rawOrigin,
      rotationDegrees: rotationRaw / 10,
      mirrorFlag,
      orientationBytesHex: buffer.subarray(tailStart, tailStart + 4).toString("hex"),
      pinSlotTableOffset,
      pinSlotAddresses,
      propertiesPayloadLength,
      propertiesPayloadOffset,
      propertiesPayloadEmbeddedInLabel,
      labelBlocks,
    },
  };
}

function findProteusComponentRecord(
  buffer: Buffer,
  markerOffset: number,
  objectDataStart: number,
): ProteusComponentRecordSearchResult {
  // The first label block can precede the OBJECT DATA marker that scopes the
  // placed-instance COMPONENT ID. Anchor the record to the exact ID marker,
  // but allow scanning back across the section boundary.
  const searchStart = Math.max(0, markerOffset - 512);
  const candidates: ParsedProteusComponentRecord[] = [];
  const candidateOffsets: number[] = [];
  const diagnostics: string[] = [];

  for (let candidate = markerOffset - 1; candidate >= searchStart; candidate -= 1) {
    if (buffer[candidate] !== 0xff || candidate + 2 > buffer.length) continue;
    const textLength = buffer[candidate + 1];
    if (textLength < 1 || textLength > 6) continue;
    candidateOffsets.push(candidate);
    const attemptDiagnostics: string[] = [];
    const parsed = parseProteusComponentRecordAt(
      buffer,
      candidate,
      markerOffset,
      attemptDiagnostics,
    );
    if (parsed) candidates.push(parsed);
    else diagnostics.push(`${candidate}:${attemptDiagnostics.join("|")}`);
  }

  if (candidates.length === 0) {
    return { record: null, candidateOffsets, diagnostics, ambiguous: false };
  }
  if (candidates.length > 1) {
    const starts = new Set(candidates.map((candidate) => candidate.recordStartOffset));
    if (starts.size > 1) {
      return {
        record: null,
        candidateOffsets,
        diagnostics: [...diagnostics, `ambiguous-valid-record-candidates:${[...starts].join(",")}`],
        ambiguous: true,
      };
    }
  }
  return {
    record: candidates.sort((left, right) => left.recordStartOffset - right.recordStartOffset)[0],
    candidateOffsets,
    diagnostics,
    ambiguous: false,
  };
}

/**
 * Decodes the conservative component-instance subset of ROOT.DSN:
 * - the four text blocks and attribute anchors in a placed component record;
 * - component device, physical origin, angle/mirror flag and pin-slot array;
 * - visible value and printable brace-delimited instance properties.
 *
 * It still needs symbol-definition geometry and application-level validation
 * before physical pin endpoints or a fully simulated netlist can be claimed.
 */
function parseProteusSymbolDefinition(
  buffer: Buffer,
  device: string,
  diagnostics: string[] = [],
): ProteusSchematicSymbolDefinition | null {
  const circuitMarker = Buffer.concat([
    Buffer.from([0xff]),
    Buffer.from("ISIS CIRCUIT FILE", "ascii"),
  ]);
  const libraryEnd = buffer.indexOf(circuitMarker);
  if (libraryEnd < 0) {
    diagnostics.push("library-section-marker-not-found");
    return null;
  }
  const deviceBytes = Buffer.from(device, "latin1");
  if (deviceBytes.length < 1 || deviceBytes.length > 60) {
    diagnostics.push(`invalid-device-name-length:${deviceBytes.length}`);
    return null;
  }
  const deviceTag = Buffer.alloc(2 + deviceBytes.length);
  deviceTag.writeUInt16LE(deviceBytes.length, 0);
  deviceBytes.copy(deviceTag, 2);

  const tagOffsets = findAllBufferOccurrences(buffer.subarray(0, libraryEnd), deviceTag);
  const entries: Array<{ offset: number; byteLength: number }> = [];
  for (const offset of tagOffsets) {
    const timestampOffset = offset + deviceTag.length;
    if (timestampOffset + 4 > libraryEnd) continue;
    const timestamp = buffer.readUInt32LE(timestampOffset);
    if (timestamp <= 0x40000000 || timestamp >= 0x80000000) continue;
    const headerLength = 2 + deviceBytes.length + 4 + 9;
    const bodyLengthOffset = offset + headerLength;
    if (bodyLengthOffset + 4 > libraryEnd) continue;
    const bodyLength = buffer.readUInt32LE(bodyLengthOffset);
    const totalLength = headerLength + bodyLength;
    if (bodyLength > 20 && totalLength <= libraryEnd - offset) {
      entries.push({ offset, byteLength: totalLength });
    }
  }
  if (entries.length === 0) {
    const rawDeviceOffsets = findAllBufferOccurrences(
      buffer.subarray(0, libraryEnd),
      deviceBytes,
    );
    const samples = rawDeviceOffsets.slice(0, 12).map((offset) => ({
      offset,
      prefixHex: buffer.subarray(Math.max(0, offset - 4), offset).toString("hex"),
      suffixHex: buffer.subarray(offset + deviceBytes.length, offset + deviceBytes.length + 8).toString("hex"),
    }));
    diagnostics.push(
      `device-definition-not-found:${device}:library-end=${libraryEnd}:tag-offsets=${tagOffsets.length}:raw-name-offsets=${rawDeviceOffsets.length}:samples=${JSON.stringify(samples)}`,
    );
    return null;
  }
  entries.sort((left, right) => left.offset - right.offset);
  diagnostics.push(`device-definition-candidates:${entries.map((entry) => `${entry.offset}/${entry.byteLength}`).join(",")}`);

  for (const entry of entries) {
    const blockEnd = entry.offset + entry.byteLength;
    const blockText = buffer.subarray(entry.offset, blockEnd).toString("latin1");
    const markerPattern = /\$PIN[A-Z]+\0/g;
    const pins: ProteusSchematicSymbolPin[] = [];
    for (const match of blockText.matchAll(markerPattern)) {
      const markerOffset = entry.offset + (match.index ?? 0);
      if (markerOffset < entry.offset + 16 || markerOffset >= blockEnd) continue;
      const nameStart = markerOffset + match[0].length;
      const nameEnd = buffer.indexOf(0, nameStart);
      if (nameEnd < nameStart || nameEnd >= blockEnd) continue;
      const numberStart = nameEnd + 1;
      const numberEnd = buffer.indexOf(0, numberStart);
      if (numberEnd < numberStart || numberEnd >= blockEnd) continue;
      const name = buffer.subarray(nameStart, nameEnd).toString("latin1");
      const number = buffer.subarray(numberStart, numberEnd).toString("latin1");
      if (!name || [...name, ...number].some((character) => {
        const code = character.charCodeAt(0);
        return code < 0x20 || code > 0x7e;
      })) continue;
      const flags = buffer.readUInt32LE(markerOffset - 16);
      const rawX = buffer.readInt32LE(markerOffset - 12);
      const rawY = buffer.readInt32LE(markerOffset - 8);
      pins.push({
        name,
        number,
        hidden: (flags & 0xff) === 0x07,
        base: { x: rawX / 2540, y: rawY / 2540 },
        direction: { x: 0, y: 0 },
      });
    }
    if (pins.length === 0) {
      diagnostics.push(`definition-${entry.offset}:no-valid-pin-markers`);
      continue;
    }
    const minX = Math.min(...pins.map((pin) => pin.base.x));
    const maxX = Math.max(...pins.map((pin) => pin.base.x));
    const minY = Math.min(...pins.map((pin) => pin.base.y));
    const maxY = Math.max(...pins.map((pin) => pin.base.y));
    for (const pin of pins) {
      const { x, y } = pin.base;
      if (minX !== maxX && x === minX) pin.direction = { x: -1, y: 0 };
      else if (minX !== maxX && x === maxX) pin.direction = { x: 1, y: 0 };
      else if (y === minY) pin.direction = { x: 0, y: -1 };
      else if (y === maxY) pin.direction = { x: 0, y: 1 };
    }
    diagnostics.push(`definition-${entry.offset}:decoded-pins=${pins.length}`);
    return { offset: entry.offset, byteLength: entry.byteLength, pins };
  }
  return null;
}

function orderProteusCdbPinsBySymbolDefinition(
  cdbPins: ProteusComponentPinMetadata[],
  symbolPins: ProteusSchematicSymbolPin[],
): { pins: ProteusComponentPinMetadata[]; matchedCount: number } {
  const remaining = [...cdbPins];
  const ordered: ProteusComponentPinMetadata[] = [];
  for (const symbolPin of symbolPins) {
    let index = remaining.findIndex((pin) => pin.name === symbolPin.name);
    if (index < 0) {
      const name = symbolPin.name.toLocaleLowerCase("en-US");
      index = remaining.findIndex((pin) => pin.name.toLocaleLowerCase("en-US") === name);
    }
    if (index < 0 && symbolPin.number) {
      index = remaining.findIndex((pin) => pin.number === symbolPin.number);
    }
    if (index >= 0) ordered.push(remaining.splice(index, 1)[0]);
  }
  return {
    pins: [...ordered, ...remaining],
    matchedCount: ordered.length,
  };
}

function rotateProteusPoint(
  point: { x: number; y: number },
  degrees: number,
): { x: number; y: number } {
  const normalized = ((degrees % 360) + 360) % 360;
  if (normalized % 90 === 0) {
    const turns = Math.round(normalized / 90) % 4;
    const rotated = [
      { x: point.x, y: point.y },
      { x: -point.y, y: point.x },
      { x: -point.x, y: -point.y },
      { x: point.y, y: -point.x },
    ][turns];
    return {
      x: Math.round(rotated.x * 1e6) / 1e6,
      y: Math.round(rotated.y * 1e6) / 1e6,
    };
  }
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

function parseProteusTerminalPlacements(
  buffer: Buffer,
  objectDataOffsets: number[],
  objectDataMarker: Buffer,
  wireSegments: ProteusSchematicWireSegment[],
): ProteusSchematicTerminalPlacement[] {
  const kinds = [
    { kind: "POWER" as const, name: "$TERPOWER", pinOffset: { x: 100, y: -300 } },
    { kind: "GROUND" as const, name: "$TERGROUND", pinOffset: { x: 100, y: 300 } },
  ];
  const knownWireOffsets = new Set(wireSegments.map((wire) => wire.objectOffset));
  const placements: ProteusSchematicTerminalPlacement[] = [];

  for (const { kind, name, pinOffset } of kinds) {
    const nameBytes = Buffer.from(name, "ascii");
    const tag = Buffer.alloc(nameBytes.length + 2);
    tag.writeUInt16LE(nameBytes.length, 0);
    nameBytes.copy(tag, 2);

    for (const tagOffset of findAllBufferOccurrences(buffer, nameBytes)) {
      const objectOffset = tagOffset - 15;
      const objectDataStart = objectDataOffsets
        .filter((candidate) => candidate < tagOffset)
        .pop();
      const objectDataEnd = objectDataOffsets.find((candidate) => candidate > tagOffset) ?? buffer.length;
      const byteLength = 96 + nameBytes.length;
      if (
        objectDataStart === undefined ||
        objectOffset < objectDataStart + objectDataMarker.length ||
        objectOffset + byteLength > objectDataEnd ||
        !buffer.subarray(objectOffset + 13, objectOffset + 15).equals(tag.subarray(0, 2)) ||
        !buffer.subarray(tagOffset, tagOffset + nameBytes.length).equals(nameBytes) ||
        buffer[objectOffset] !== 0x10
      ) {
        continue;
      }

      const tailOffset = objectOffset + 15 + nameBytes.length;
      const labelMarker = Buffer.from("TERMINAL LABEL\0", "ascii");
      const labelMarkerOffset = buffer.indexOf(labelMarker, tailOffset);
      if (labelMarkerOffset < tailOffset || labelMarkerOffset >= objectOffset + byteLength) continue;

      const originRaw = {
        x: buffer.readInt32LE(objectOffset + 1),
        y: buffer.readInt32LE(objectOffset + 5),
      };
      const labelRaw = {
        x: buffer.readInt32LE(tailOffset + 11),
        y: buffer.readInt32LE(tailOffset + 15),
      };
      const wireValue = buffer.readUInt32LE(tailOffset + 77);
      const wireObjectOffset = wireValue === 0 ? null : wireValue;
      const connectionPoint = {
        x: labelRaw.x / 2540 + pinOffset.x,
        y: labelRaw.y / 2540 + pinOffset.y,
      };
      const rawConnectionPoint = {
        x: Math.round(connectionPoint.x * 2540),
        y: Math.round(connectionPoint.y * 2540),
      };
      const wire = wireObjectOffset === null
        ? undefined
        : wireSegments.find((candidate) => candidate.objectOffset === wireObjectOffset);
      const connectionPointMatchesWire = wireObjectOffset === null
        ? null
        : wire
          ? wire.rawPoints.some((vertex, index) =>
              index < wire.rawPoints.length - 1 &&
              pointOnProteusWireSegment(
                rawConnectionPoint,
                vertex,
                wire.rawPoints[index + 1],
              ),
            )
          : false;

      placements.push({
        sourceOffset: objectOffset,
        byteLength,
        kind,
        origin: { x: originRaw.x / 2540, y: originRaw.y / 2540 },
        labelAnchor: { x: labelRaw.x / 2540, y: labelRaw.y / 2540 },
        connectionPoint,
        wireObjectOffset,
        wireReferenceValid: wireObjectOffset === null ? null : knownWireOffsets.has(wireObjectOffset),
        connectionPointMatchesWire,
      });
    }
  }

  return placements.sort((left, right) => left.sourceOffset - right.sourceOffset);
}

function pointOnProteusWireSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
): boolean {
  if (start.x === end.x && start.y === end.y) {
    return point.x === start.x && point.y === start.y;
  }
  const cross = (end.x - start.x) * (point.y - start.y) -
    (end.y - start.y) * (point.x - start.x);
  if (cross !== 0) return false;
  const dot = (point.x - start.x) * (end.x - start.x) +
    (point.y - start.y) * (end.y - start.y);
  const squaredLength = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
  return dot >= 0 && dot <= squaredLength;
}

function parseProteusDsnComponentInstances(
  buffer: Buffer,
  libraryComponents: ProteusComponentMetadata[],
): ProteusSchematicInspection {
  const signature = Buffer.from("ISIS SCHEMATIC FILE", "ascii");
  if (buffer.length < signature.length || !buffer.subarray(0, signature.length).equals(signature)) {
    throw new Error("ROOT.DSN no comienza con la cabecera ISIS SCHEMATIC FILE esperada.");
  }

  const marker = Buffer.concat([Buffer.from("COMPONENT ID", "ascii"), Buffer.from([0])]);
  const offsets = findAllBufferOccurrences(buffer, marker);
  const objectDataMarker = Buffer.concat([
    Buffer.from("OBJECT DATA", "ascii"),
    Buffer.from([0]),
  ]);
  const objectDataOffsets = findAllBufferOccurrences(buffer, objectDataMarker);
  // Inventory marker offsets only; these records have not yet been decoded into
  // wire endpoints, pin terminals or electrical nets.
  const wireMarkerOffsets = findAllBufferOccurrences(
    buffer,
    Buffer.concat([Buffer.from("WIRE", "ascii"), Buffer.from([0])]),
  );
  const terminalMarkerOffsets = findAllBufferOccurrences(
    buffer,
    Buffer.concat([Buffer.from("TERMINAL", "ascii"), Buffer.from([0])]),
  );
  const terminalLabelMarkerOffsets = findAllBufferOccurrences(
    buffer,
    Buffer.concat([Buffer.from("TERMINAL LABEL", "ascii"), Buffer.from([0])]),
  );
  const propertiesMarkerOffsets = findAllBufferOccurrences(
    buffer,
    Buffer.concat([Buffer.from("PROPERTIES", "ascii"), Buffer.from([0])]),
  );
  const wireMarkerSpans = wireMarkerOffsets.map((offset): ProteusSchematicMarkerSpan => {
    const nextWire = wireMarkerOffsets.find((candidate) => candidate > offset);
    const nextObjectData = objectDataOffsets.find((candidate) => candidate > offset);
    if (nextWire !== undefined && (nextObjectData === undefined || nextWire < nextObjectData)) {
      return { offset, byteWindowLength: nextWire - offset, nextBoundary: "wire-marker" };
    }
    if (nextObjectData !== undefined) {
      return { offset, byteWindowLength: nextObjectData - offset, nextBoundary: "object-data-marker" };
    }
    return { offset, byteWindowLength: buffer.length - offset, nextBoundary: "end-of-file" };
  });
  const wireSegments: ProteusSchematicWireSegment[] = [];
  const unresolvedWireMarkerOffsets: number[] = [];
  const wirePrefix = Buffer.from([
    0x00, 0x1d, 0x00, 0x00, 0x00,
    0x00, 0xc0, 0x9e, 0x00, 0x00,
    // Bytes +10..+12 are style/color and intentionally remain variable.
    0x00, 0x00, 0x00,
    0x00, 0x01, 0xff, 0xff, 0xff, 0x00, 0xff, 0xff, 0xff, 0x00,
    0x02, 0x7f,
    0x57, 0x49, 0x52, 0x45,
    0x00, 0x00, 0x00,
  ]);
  for (const markerOffset of wireMarkerOffsets) {
    const objectOffset = markerOffset - 25;
    const objectDataStart = objectDataOffsets
      .filter((candidate) => candidate < markerOffset)
      .pop();
    const objectDataEnd = objectDataOffsets.find((candidate) => candidate > markerOffset) ?? buffer.length;
    if (objectDataStart === undefined || objectOffset < objectDataStart + objectDataMarker.length) {
      unresolvedWireMarkerOffsets.push(markerOffset);
      continue;
    }

    const prefixMatches =
      objectOffset >= 0 &&
      objectOffset + 34 <= objectDataEnd &&
      buffer[objectOffset] === 0x00 &&
      buffer.readUInt32LE(objectOffset + 1) === 0x1d &&
      buffer.subarray(objectOffset + 5, objectOffset + 10).equals(wirePrefix.subarray(5, 10)) &&
      buffer.subarray(objectOffset + 13, objectOffset + 32).equals(wirePrefix.subarray(13, 32));

    if (!prefixMatches || buffer.toString("ascii", objectOffset + 25, objectOffset + 29) !== "WIRE") {
      unresolvedWireMarkerOffsets.push(markerOffset);
      continue;
    }

    const vertexCount = buffer.readUInt16LE(objectOffset + 32);
    const byteLength = 34 + 8 * vertexCount;
    if (
      vertexCount < 2 ||
      vertexCount > 256 ||
      objectOffset + byteLength > objectDataEnd
    ) {
      unresolvedWireMarkerOffsets.push(markerOffset);
      continue;
    }

    const rawPoints = Array.from({ length: vertexCount }, (_, index) => ({
      x: buffer.readInt32LE(objectOffset + 34 + index * 8),
      y: buffer.readInt32LE(objectOffset + 38 + index * 8),
    }));
    const points = rawPoints.map(({ x, y }) => ({ x: x / 2540, y: y / 2540 }));
    wireSegments.push({
      objectOffset,
      markerOffset,
      byteLength,
      vertexCount,
      points,
      rawPoints,
    });
  }

  const pointOnWireSegment = (
    point: { x: number; y: number },
    start: { x: number; y: number },
    end: { x: number; y: number },
  ): boolean => {
    if (start.x === end.x && start.y === end.y) {
      return point.x === start.x && point.y === start.y;
    }
    const cross = (end.x - start.x) * (point.y - start.y) -
      (end.y - start.y) * (point.x - start.x);
    if (cross !== 0) return false;
    const dot = (point.x - start.x) * (end.x - start.x) +
      (point.y - start.y) * (end.y - start.y);
    const squaredLength = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
    return dot >= 0 && dot <= squaredLength;
  };
  const wireSegmentsTouch = (
    left: ProteusSchematicWireSegment,
    right: ProteusSchematicWireSegment,
  ): boolean => {
    for (const point of left.rawPoints) {
      for (let index = 0; index < right.rawPoints.length - 1; index += 1) {
        if (pointOnWireSegment(point, right.rawPoints[index], right.rawPoints[index + 1])) return true;
      }
    }
    for (const point of right.rawPoints) {
      for (let index = 0; index < left.rawPoints.length - 1; index += 1) {
        if (pointOnWireSegment(point, left.rawPoints[index], left.rawPoints[index + 1])) return true;
      }
    }
    return false;
  };
  const wireParents = wireSegments.map((_, index) => index);
  const findWireRoot = (index: number): number => {
    while (wireParents[index] !== index) {
      wireParents[index] = wireParents[wireParents[index]];
      index = wireParents[index];
    }
    return index;
  };
  for (let left = 0; left < wireSegments.length; left += 1) {
    for (let right = left + 1; right < wireSegments.length; right += 1) {
      if (!wireSegmentsTouch(wireSegments[left], wireSegments[right])) continue;
      const leftRoot = findWireRoot(left);
      const rightRoot = findWireRoot(right);
      if (leftRoot !== rightRoot) wireParents[rightRoot] = leftRoot;
    }
  }
  const wireGroups = new Map<number, number[]>();
  wireSegments.forEach((segment, index) => {
    const root = findWireRoot(index);
    const group = wireGroups.get(root) ?? [];
    group.push(segment.objectOffset);
    wireGroups.set(root, group);
  });
  const wireTouchGroups = [...wireGroups.values()]
    .map((wireObjectOffsets) => ({ wireObjectOffsets }))
    .sort((left, right) => left.wireObjectOffsets[0] - right.wireObjectOffsets[0]);

  const terminalPlacements = parseProteusTerminalPlacements(
    buffer,
    objectDataOffsets,
    objectDataMarker,
    wireSegments,
  );

  const wireByObjectOffset = new Map(wireSegments.map((segment) => [segment.objectOffset, segment]));
  const pointLiesOnWire = (
    point: { x: number; y: number },
    wire: ProteusSchematicWireSegment,
  ): boolean => wire.rawPoints.some((vertex, index) =>
    index < wire.rawPoints.length - 1 &&
    pointOnWireSegment(point, vertex, wire.rawPoints[index + 1]),
  );
  const junctionNodes: ProteusSchematicJunctionNode[] = [];
  for (const sectionStart of objectDataOffsets) {
    const sectionEnd = objectDataOffsets.find((candidate) => candidate > sectionStart) ?? buffer.length;
    for (let offset = sectionStart + objectDataMarker.length; offset + 25 <= sectionEnd; offset += 1) {
      if (buffer[offset] !== 0x01) continue;
      const refs = Array.from({ length: 4 }, (_, index) => buffer.readUInt32LE(offset + 9 + index * 4));
      const nonZeroRefs = refs.filter((reference) => reference !== 0);
      if (
        nonZeroRefs.length < 3 ||
        nonZeroRefs.length > 4 ||
        refs.slice(0, nonZeroRefs.length).some((reference) => reference === 0) ||
        refs.slice(nonZeroRefs.length).some((reference) => reference !== 0) ||
        new Set(nonZeroRefs).size !== nonZeroRefs.length
      ) {
        continue;
      }
      const rawX = buffer.readInt32LE(offset + 1);
      const rawY = buffer.readInt32LE(offset + 5);
      const point = { x: rawX, y: rawY };
      const referencedWires = nonZeroRefs.map((reference) => wireByObjectOffset.get(reference));
      if (referencedWires.some((wire) => wire === undefined)) continue;
      if (!referencedWires.every((wire) => pointLiesOnWire(point, wire!))) continue;
      junctionNodes.push({
        objectOffset: offset,
        x: rawX / 2540,
        y: rawY / 2540,
        rawX,
        rawY,
        wireObjectOffsets: nonZeroRefs,
      });
      offset += 24;
    }
  }

  const markersOutsideObjectData = offsets.filter((markerOffset) =>
    !objectDataOffsets.some((objectOffset) => objectOffset < markerOffset),
  ).length;
  const metadataReferences = new Set(libraryComponents.map((component) => component.reference));
  const seenReferences = new Set<string>();
  const componentInstances: ProteusSchematicComponentInstance[] = [];
  const unresolvedObjects: ProteusSchematicUnresolvedObject[] = [];

  for (let index = 0; index < offsets.length; index += 1) {
    const markerOffset = offsets[index];
    const objectDataOffset = objectDataOffsets
      .filter((objectOffset) => objectOffset < markerOffset)
      .pop();
    // Library/template definitions also contain COMPONENT ID markers. Only records
    // nested after OBJECT DATA are placed schematic instances.
    if (objectDataOffset === undefined) continue;

    const nextComponentMarker = offsets[index + 1] ?? buffer.length;
    const nextObjectDataMarker = objectDataOffsets.find((objectOffset) => objectOffset > markerOffset);
    const recordEnd = Math.min(nextComponentMarker, nextObjectDataMarker ?? buffer.length);
    const objectDataStart = objectDataOffset + objectDataMarker.length;
    const recordSearch = findProteusComponentRecord(buffer, markerOffset, objectDataStart);
    const parsedRecord = recordSearch.record;
    const searchStart = Math.max(objectDataStart, markerOffset - 80);
    let reference: string | null = parsedRecord?.reference ?? null;
    let referenceTokenEnd: number | null = null;

    if (!reference) {
      for (let candidate = markerOffset - 1; candidate >= searchStart; candidate -= 1) {
        if (buffer[candidate] !== 0xff) continue;
        const field = readProteusLengthPrefixedAscii(buffer, candidate, 16);
        if (field && isProteusDesignator(field.value)) {
          reference = field.value.trim();
          referenceTokenEnd = field.next;
          break;
        }
      }
    }

    const valueStart = markerOffset + marker.length;
    const valueLimit = Math.min(recordEnd, valueStart + 12);
    let value: string | null = parsedRecord?.value ?? null;
    if (!value) {
      for (let candidate = valueStart; candidate < valueLimit; candidate += 1) {
        if (buffer[candidate] !== 0xff) continue;
        const field = readProteusLengthPrefixedAscii(buffer, candidate, 128);
        if (field) {
          value = field.value;
          break;
        }
      }
    }

    // COMPONENT VALUE is a distinct ISIS marker: its following FF-length token
    // identifies the library definition/part, not the visible component value.
    const componentValueMarker = Buffer.concat([
      Buffer.from("COMPONENT VALUE", "ascii"),
      Buffer.from([0]),
    ]);
    const componentValueMarkerOffset = buffer.indexOf(componentValueMarker, valueStart);
    let libraryName: string | null = null;
    if (
      componentValueMarkerOffset >= valueStart &&
      componentValueMarkerOffset + componentValueMarker.length <= recordEnd
    ) {
      // The marker is followed by reserved/binary bytes before the FF-length token.
      // Search only a small bounded window, just as for COMPONENT ID's visible value.
      const libraryValueStart = componentValueMarkerOffset + componentValueMarker.length;
      const libraryValueLimit = Math.min(recordEnd, libraryValueStart + 32);
      for (let candidate = libraryValueStart; candidate < libraryValueLimit; candidate += 1) {
        if (buffer[candidate] !== 0xff) continue;
        const libraryField = readProteusLengthPrefixedAscii(buffer, candidate, 128);
        if (libraryField && libraryField.next <= recordEnd) {
          libraryName = libraryField.value;
          break;
        }
      }
    }

    const recordText = buffer.subarray(markerOffset, recordEnd).toString("latin1");
    const properties = extractProteusProperties(recordText);

    if (!reference) {
      unresolvedObjects.push({
        sourceOffset: markerOffset,
        reference: null,
        value,
        libraryName,
        reason: "missing-reference-designator",
      });
      continue;
    }
    if (seenReferences.has(reference)) {
      unresolvedObjects.push({
        sourceOffset: markerOffset,
        reference,
        value,
        libraryName,
        reason: "duplicate-reference",
      });
      continue;
    }

    const metadata = libraryComponents.find((component) => component.reference === reference);
    const libraryNameMatchesDeviceMetadata = libraryName !== null && metadata
      ? libraryName.trim().toUpperCase() === metadata.device.trim().toUpperCase()
      : null;

    seenReferences.add(reference);
    const symbolDefinitionDiagnostics: string[] = [];
    const symbolDefinition = parsedRecord
      ? parseProteusSymbolDefinition(
          buffer,
          parsedRecord.placement.device,
          symbolDefinitionDiagnostics,
        )
      : null;
    componentInstances.push({
      reference,
      componentRecordParseStatus: parsedRecord
        ? "decoded"
        : recordSearch.ambiguous
          ? "ambiguous"
          : "not-found",
      componentRecordCandidateOffsets: recordSearch.candidateOffsets,
      componentRecordDiagnostics: recordSearch.diagnostics,
      recordStartOffset: parsedRecord?.recordStartOffset ??
        (referenceTokenEnd === null ? searchStart : referenceTokenEnd - (2 + reference.length)),
      sourceOffset: markerOffset,
      placement: parsedRecord?.placement ?? null,
      symbolDefinition,
      symbolDefinitionDiagnostics,
      value,
      libraryName,
      libraryNameMatchesDeviceMetadata,
      wireAddressReferences: [],
      pinSlotTableOffset: parsedRecord?.placement.pinSlotTableOffset ?? null,
      pinSlotMappingStatus: metadata?.pinEntryStatus === "ambiguous"
        ? "ambiguous"
        : metadata?.pins.length
          ? "count-mismatch"
          : "unavailable",
      pinConnections: [],
      properties,
      matchesComponentMetadata: metadataReferences.has(reference),
    });
  }

  // The structural parser provides the exact pin-slot table offset. The
  // bounded tail scan remains only as a fallback for synthetic/legacy records.
  const knownWireOffsets = new Set(wireSegments.map((segment) => segment.objectOffset));
  const orderedInstances = [...componentInstances].sort(
    (left, right) => left.recordStartOffset - right.recordStartOffset,
  );
  for (const instance of orderedInstances) {
    if (instance.placement) {
      instance.placement.pinSlotAddresses.forEach((wireObjectOffset, slotIndex) => {
        if (!knownWireOffsets.has(wireObjectOffset)) return;
        instance.wireAddressReferences.push({
          byteOffset: instance.placement!.pinSlotTableOffset + slotIndex * 4,
          wireObjectOffset,
        });
      });
      continue;
    }

    const nextComponentStart = orderedInstances.find(
      (candidate) => candidate.recordStartOffset > instance.recordStartOffset,
    )?.recordStartOffset;
    const nextObjectStart = [
      ...junctionNodes.map((node) => node.objectOffset),
      ...unresolvedObjects.map((object) => object.sourceOffset),
      ...wireSegments.map((wire) => wire.objectOffset),
    ]
      .filter((offset) => offset > instance.recordStartOffset)
      .sort((left, right) => left - right)[0];
    const boundaryCandidates = [nextComponentStart, nextObjectStart]
      .filter((value): value is number => value !== undefined);
    const recordBoundary = boundaryCandidates.length > 0
      ? Math.min(...boundaryCandidates)
      : buffer.length;
    const tailStart = Math.max(instance.recordStartOffset, recordBoundary - 32);
    for (let byteOffset = tailStart; byteOffset + 4 <= recordBoundary; byteOffset += 1) {
      const wireObjectOffset = buffer.readUInt32LE(byteOffset);
      if (!knownWireOffsets.has(wireObjectOffset)) continue;
      instance.wireAddressReferences.push({ byteOffset, wireObjectOffset });
    }
  }

  const metadataByReference = new Map(libraryComponents.map((component) => [component.reference, component]));
  for (let index = 0; index < orderedInstances.length; index += 1) {
    const instance = orderedInstances[index];
    const metadata = metadataByReference.get(instance.reference);
    if (!metadata || metadata.pinEntryStatus === "ambiguous" || metadata.pins.length === 0) continue;

    const nextComponentStart = orderedInstances[index + 1]?.recordStartOffset;
    const nextObjectStart = [
      ...junctionNodes.map((node) => node.objectOffset),
      ...unresolvedObjects.map((object) => object.sourceOffset),
      ...wireSegments.map((wire) => wire.objectOffset),
    ]
      .filter((offset) => offset > instance.recordStartOffset)
      .sort((left, right) => left - right)[0];
    const boundaryCandidates = [nextComponentStart, nextObjectStart]
      .filter((value): value is number => value !== undefined);
    const recordBoundary = boundaryCandidates.length > 0
      ? Math.min(...boundaryCandidates)
      : buffer.length;
    const slotCount = metadata.pins.length;
    let slotTable: { offset: number; slots: number[] } | null = null;

    if (instance.placement) {
      const slots = instance.placement.pinSlotAddresses;
      const nonZero = slots.filter((value) => value !== 0);
      const referencesMatch =
        nonZero.length === instance.wireAddressReferences.length &&
        nonZero.every((value) => instance.wireAddressReferences.some(
          (reference) => reference.wireObjectOffset === value,
        ));
      if (slots.length === slotCount && referencesMatch &&
          slots.every((value) => value === 0 || knownWireOffsets.has(value))) {
        slotTable = {
          offset: instance.placement.pinSlotTableOffset,
          slots,
        };
      } else {
        instance.pinSlotMappingStatus = "count-mismatch";
        continue;
      }
    } else {
      const candidateStarts: Array<{ offset: number; slots: number[] }> = [];
      // Conservative fallback for records where the four-block structure was
      // not decoded; real placed records should use their exact parsed offset.
      const minimumStart = Math.max(instance.recordStartOffset, recordBoundary - slotCount * 4 - 16);
      const maximumStart = recordBoundary - slotCount * 4;
      for (let candidate = minimumStart; candidate <= maximumStart; candidate += 1) {
        const slots = Array.from({ length: slotCount }, (_, slot) =>
          buffer.readUInt32LE(candidate + slot * 4),
        );
        if (slots.every((value) => value === 0 || knownWireOffsets.has(value))) {
          const nonZero = slots.filter((value) => value !== 0);
          if (
            nonZero.length === instance.wireAddressReferences.length &&
            nonZero.every((value) => instance.wireAddressReferences.some(
              (reference) => reference.wireObjectOffset === value,
            ))
          ) {
            candidateStarts.push({ offset: candidate, slots });
          }
        }
      }
      if (candidateStarts.length !== 1) {
        instance.pinSlotMappingStatus = candidateStarts.length > 1 ? "ambiguous" : "count-mismatch";
        continue;
      }
      slotTable = candidateStarts[0];
    }

    if (!slotTable) {
      instance.pinSlotMappingStatus = "count-mismatch";
      continue;
    }
    instance.pinSlotTableOffset = slotTable.offset;

    const symbolDefinition = instance.symbolDefinition;
    let orderedPins = metadata.pins;
    let symbolOrderVerified = false;
    if (symbolDefinition) {
      const order = orderProteusCdbPinsBySymbolDefinition(metadata.pins, symbolDefinition.pins);
      orderedPins = order.pins;
      symbolOrderVerified =
        order.matchedCount === metadata.pins.length &&
        symbolDefinition.pins.length === metadata.pins.length;
    }

    const placement = instance.placement;
    const canTransformSymbolPins = Boolean(
      symbolDefinition &&
      placement &&
      (placement.mirrorFlag === 0 || placement.mirrorFlag === 1),
    );
    const pinLength = placement && placement.pinCount > 20 ? 200 : 100;
    let everyConnectedPinMatches = true;
    let hasConnectedPin = false;

    instance.pinConnections = orderedPins.map((pin, slotIndex) => {
      const wireObjectOffset = slotTable.slots[slotIndex] || null;
      const symbolPin = symbolDefinition?.pins[slotIndex] ?? null;
      let symbolRoot: { x: number; y: number } | null = null;
      let connectionPoint: { x: number; y: number } | null = null;
      let connectionPointMatchesWire: boolean | null = null;

      if (symbolPin && placement && canTransformSymbolPins) {
        const mirror = placement.mirrorFlag === 1;
        const base = {
          x: mirror ? -symbolPin.base.x : symbolPin.base.x,
          y: symbolPin.base.y,
        };
        const direction = {
          x: mirror ? -symbolPin.direction.x : symbolPin.direction.x,
          y: symbolPin.direction.y,
        };
        const rootRelative = rotateProteusPoint(base, placement.rotationDegrees);
        const tipRelative = rotateProteusPoint({
          x: base.x + direction.x * pinLength,
          y: base.y + direction.y * pinLength,
        }, placement.rotationDegrees);
        symbolRoot = {
          x: placement.origin.x + rootRelative.x,
          y: placement.origin.y + rootRelative.y,
        };
        connectionPoint = {
          x: placement.origin.x + tipRelative.x,
          y: placement.origin.y + tipRelative.y,
        };

        if (wireObjectOffset !== null) {
          const wire = wireSegments.find((segment) => segment.objectOffset === wireObjectOffset);
          const rawPoint = {
            x: Math.round(connectionPoint.x * 2540),
            y: Math.round(connectionPoint.y * 2540),
          };
          connectionPointMatchesWire = wire
            ? wire.rawPoints.some((vertex, pointIndex) =>
                pointIndex < wire.rawPoints.length - 1 &&
                pointOnWireSegment(rawPoint, vertex, wire.rawPoints[pointIndex + 1]),
              )
            : false;
          hasConnectedPin = true;
          if (!connectionPointMatchesWire) everyConnectedPinMatches = false;
        }
      }

      return {
        slotIndex,
        pinName: pin.name,
        pinNumber: pin.number,
        mappingBasis: symbolOrderVerified ? "symbol-pin-name" as const : "cdb-order-unverified" as const,
        wireObjectOffset,
        symbolRoot,
        connectionPoint,
        connectionPointMatchesWire,
      };
    });

    if (!symbolOrderVerified || !canTransformSymbolPins) {
      instance.pinSlotMappingStatus = "slot-table-valid-symbol-order-unverified";
    } else if (hasConnectedPin && everyConnectedPinMatches) {
      instance.pinSlotMappingStatus = "matched-by-symbol-geometry";
    } else {
      instance.pinSlotMappingStatus = "symbol-geometry-mismatch";
    }
  }

  componentInstances.sort((left, right) => left.reference.localeCompare(right.reference));
  const decodedReferences = new Set(componentInstances.map((instance) => instance.reference));
  const componentReferencesWithoutMetadata = componentInstances
    .filter((instance) => !instance.matchesComponentMetadata)
    .map((instance) => instance.reference);
  const metadataReferencesWithoutSchematicInstance = libraryComponents
    .filter((component) => !decodedReferences.has(component.reference))
    .map((component) => component.reference)
    .sort((left, right) => left.localeCompare(right));
  const wireConnectedGroups = wireTouchGroups.map((group): ProteusSchematicWireConnectedGroup => {
    const wireOffsets = new Set(group.wireObjectOffsets);
    return {
      wireObjectOffsets: group.wireObjectOffsets,
      junctionNodeOffsets: junctionNodes
        .filter((node) => node.wireObjectOffsets.some((offset) => wireOffsets.has(offset)))
        .map((node) => node.objectOffset),
      componentPins: componentInstances.flatMap((instance) =>
        instance.pinConnections
          .filter((pin) => pin.wireObjectOffset !== null && wireOffsets.has(pin.wireObjectOffset))
          .map((pin) => ({
            reference: instance.reference,
            slotIndex: pin.slotIndex,
            pinName: pin.pinName,
            pinNumber: pin.pinNumber,
            mappingBasis: pin.mappingBasis,
            connectionPointMatchesWire: pin.connectionPointMatchesWire,
          })),
      ),
      terminals: terminalPlacements
        .filter((terminal) =>
          terminal.wireObjectOffset !== null && wireOffsets.has(terminal.wireObjectOffset),
        )
        .map((terminal) => ({
          sourceOffset: terminal.sourceOffset,
          kind: terminal.kind,
          connectionPointMatchesWire: terminal.connectionPointMatchesWire,
        })),
    };
  });
  const componentLibraryNamesWithoutDeviceMetadataMatch = componentInstances
    .filter((instance) => instance.libraryNameMatchesDeviceMetadata === false)
    .map((instance) => instance.reference)
    .sort((left, right) => left.localeCompare(right));

  return {
    status: componentInstances.length > 0 || unresolvedObjects.length > 0 ? "partial" : "unavailable",
    source: "ROOT.DSN",
    header: "ISIS SCHEMATIC FILE",
    objectDataSectionCount: objectDataOffsets.length,
    componentIdMarkersOutsideObjectData: markersOutsideObjectData,
    wireMarkerOffsets,
    wireMarkerSpans,
    wireSegments,
    unresolvedWireMarkerOffsets,
    wireTouchGroups,
    junctionNodes,
    terminalPlacements,
    wireConnectedGroups,
    terminalMarkerOffsets,
    terminalLabelMarkerOffsets,
    propertiesMarkerOffsets,
    componentInstanceCount: componentInstances.length,
    componentInstances,
    unresolvedObjectCount: unresolvedObjects.length,
    unresolvedObjects,
    componentReferencesWithoutMetadata,
    metadataReferencesWithoutSchematicInstance,
    componentLibraryNamesWithoutDeviceMetadataMatch,
    limitations: [
      "Se reconocen registros COMPONENT ID dentro de secciones OBJECT DATA para evitar confundir definiciones de biblioteca con instancias colocadas.",
      "Se recuperan referencias y valores en formato FF + longitud + texto, junto con el offset del registro dentro de ROOT.DSN.",
      "Se decodifican los cuatro bloques de etiqueta, el dispositivo, el origen físico, el ángulo, la bandera de espejo y los offsets exactos de slots dentro del registro completo del componente.",
      "Se extraen las propiedades de texto entre llaves del registro (por ejemplo, PRIMTYPE, PACKAGE, VF, IMAX o RINT).",
      "Los objetos OBJECT DATA sin designador o con referencias duplicadas se conservan como objetos no resueltos; no se descartan silenciosamente.",
      "Los bloques WIRE reconocidos se decodifican como cadenas de vértices int32 (mils = unidades / 2540); las ventanas de marcador permanecen como información diagnóstica aparte.",
      "Se agrupan los objetos WIRE que comparten vértices con segmentos ajenos; los grupos incorporan nodos T y, cuando los punteros y la geometría coinciden, patas y terminales de componentes.",
      "Se decodifican nodos de unión de 25 bytes solo cuando al menos tres referencias apuntan a cables conocidos y sus tres geometrías pasan por las coordenadas del nodo.",
      "ROOT.CDB aporta nombres/números de pata y ROOT.DSN aporta slots exactos de WIRE; el lector intenta localizar definiciones $PIN, pero la muestra mathelecprueba.pdsprj no contiene encabezados de definición para BATTERY, LED-RED o 10WATT1K.",
      "wireConnectedGroups añade asociaciones provisionales de pata por orden CDB (mappingBasis=cdb-order-unverified) y terminales POWER/GROUND solo cuando su puntero y punto físico coinciden con un cable del grupo.",
      "Los cruces interiores sin vértice compartido no se fusionan. Las etiquetas de red aún no se decodifican, por lo que los grupos conectados no equivalen todavía a una netlist completa.",
      "Los objetos $TERPOWER y $TERGROUND se decodifican con su estructura de 13 bytes de cabecera, longitud de nombre, anclajes y puntero de cable; un puntero se considera asociado solo si resuelve a un WIRE conocido.",
      "Las conexiones de terminal se incluyen en wireConnectedGroups solo cuando su puntero apunta a un cable del grupo; también se valida geométricamente el punto de conexión.",
      "Los marcadores WIRE que no cumplen la estructura tipada se conservan en unresolvedWireMarkerOffsets, en lugar de interpretarse por aproximación.",
      "El lector reconoce los marcadores TERMINAL/TERMINAL LABEL/PROPERTIES; los objetos POWER/GROUND se parsean por su registro y puntero. La muestra real del repositorio no contiene terminales colocados, de modo que su fixture actual es sintético.",
      "Se intenta recuperar el nombre de biblioteca después de COMPONENT VALUE; la comparación con el campo device de ROOT.CDB es solo diagnóstica, porque ambos identificadores pueden diferir.",
      "Se recupera origen y orientación de instancias y la tabla exacta de slots, pero no se calculan puntos físicos de pin para este fixture porque no se localizaron definiciones $PIN de sus dispositivos.",
      "La búsqueda de $PIN queda instrumentada para otros proyectos, pero requiere una muestra que incluya los encabezados de definición de biblioteca; tampoco se decodifica aún el cuerpo gráfico completo, etiquetas de red o instrumentos virtuales.",
      "Aunque se reconstruyen grupos geométricos con patas/terminales cuando hay evidencia, aún no se genera una netlist completa ni se afirma importación o simulación en Proteus.",
      "El lector se contrastó con la muestra Proteus 8.13 del repositorio; los casos con instrumentos/objetos especiales requieren fixtures adicionales de la aplicación objetivo.",
    ],
  };
}

type ProteusCdbPinEntry = {
  offset: number;
  pins: ProteusComponentPinMetadata[];
};

function parseProteusCdbPinEntry(
  buffer: Buffer,
  reference: string,
): ProteusCdbPinEntry | null | "ambiguous" {
  const referenceBytes = Buffer.from(reference, "latin1");
  if (referenceBytes.length === 0 || referenceBytes.length > 16) return null;
  const tag = Buffer.concat([Buffer.from([referenceBytes.length]), referenceBytes]);
  const entries: ProteusCdbPinEntry[] = [];

  for (const tagOffset of findAllBufferOccurrences(buffer, tag)) {
    const entryOffset = tagOffset - 16;
    const countOffset = tagOffset + tag.length;
    if (entryOffset < 0x20 || countOffset + 4 > buffer.length) continue;

    const pinCount = buffer.readUInt32LE(countOffset);
    if (pinCount < 1 || pinCount > 256) continue;

    let cursor = countOffset + 4;
    const pins: ProteusComponentPinMetadata[] = [];
    let valid = true;
    for (let index = 0; index < pinCount; index += 1) {
      if (cursor >= buffer.length) {
        valid = false;
        break;
      }
      const nameLength = buffer[cursor];
      cursor += 1;
      if (nameLength === 0 || nameLength > 128 || cursor + nameLength + 1 > buffer.length) {
        valid = false;
        break;
      }
      const nameBytes = buffer.subarray(cursor, cursor + nameLength);
      cursor += nameLength;
      if ([...nameBytes].some((byte) => byte < 0x20 || byte > 0x7e)) {
        valid = false;
        break;
      }

      const numberLength = buffer[cursor];
      cursor += 1;
      if (numberLength > 128 || cursor + numberLength > buffer.length) {
        valid = false;
        break;
      }
      const numberBytes = buffer.subarray(cursor, cursor + numberLength);
      cursor += numberLength;
      if ([...numberBytes].some((byte) => byte < 0x20 || byte > 0x7e)) {
        valid = false;
        break;
      }

      pins.push({
        name: nameBytes.toString("latin1"),
        number: numberBytes.toString("latin1"),
      });
    }
    // The observed 8.13 CDB pin entry is followed by a 12-byte record trailer.
    if (!valid || cursor + 12 > buffer.length) continue;
    if (new Set(pins.map((pin) => pin.name)).size !== pins.length) continue;
    entries.push({ offset: entryOffset, pins });
  }

  if (entries.length === 0) return null;
  const signatures = new Set(entries.map((entry) =>
    JSON.stringify(entry.pins),
  ));
  if (signatures.size > 1) return "ambiguous";
  return entries[0];
}

function parseProteusCdbComponentMetadata(buffer: Buffer): ProteusComponentMetadata[] {
  const components: ProteusComponentMetadata[] = [];
  const seenReferences = new Set<string>();

  const readLengthPrefixedField = (offset: number): { value: string; next: number } | null => {
    if (offset >= buffer.length) return null;
    const length = buffer[offset];
    if (length > 256 || offset + 1 + length > buffer.length) return null;
    const bytes = buffer.subarray(offset + 1, offset + 1 + length);
    for (const byte of bytes) {
      if (byte < 32 || byte > 126) return null;
    }
    return { value: bytes.toString("latin1"), next: offset + 1 + length };
  };

  for (let offset = 0; offset < buffer.length; offset += 1) {
    const referenceField = readLengthPrefixedField(offset);
    if (!referenceField || !/^[A-Z]{1,5}[0-9]{1,5}$/.test(referenceField.value)) continue;

    let cursor = referenceField.next;
    const fields = [referenceField.value];
    let validFields = true;
    for (let fieldIndex = 0; fieldIndex < 3; fieldIndex += 1) {
      const field = readLengthPrefixedField(cursor);
      if (!field) {
        validFields = false;
        break;
      }
      fields.push(field.value);
      cursor = field.next;
    }
    if (!validFields || cursor + 4 > buffer.length) continue;

    const propertyDataLength = buffer.readUInt32LE(cursor);
    cursor += 4;
    if (propertyDataLength < 1 || propertyDataLength > 8192 || cursor + propertyDataLength > buffer.length) {
      continue;
    }

    const propertyData = buffer.subarray(cursor, cursor + propertyDataLength);
    const nulOffset = propertyData.indexOf(0);
    const propertyText = (nulOffset >= 0 ? propertyData.subarray(0, nulOffset) : propertyData).toString("latin1");
    if (!propertyText.startsWith("{") || !propertyText.includes("}")) continue;
    if (!/^[\t\r\n\x20-\x7e]*$/.test(propertyText)) continue;

    const properties: Record<string, string> = {};
    for (const match of propertyText.matchAll(/\{([^{}=\r\n]+)=([^{}\r\n]*)\}/g)) {
      const key = match[1].trim();
      if (key) properties[key] = match[2].trim();
    }
    if (Object.keys(properties).length === 0) continue;

    const [reference, value, device, packageName] = fields;
    if (seenReferences.has(reference)) {
      throw new Error(`ROOT.CDB contiene más de un registro de metadatos para ${reference}; no se puede resolver con seguridad.`);
    }
    seenReferences.add(reference);
    const pinEntry = parseProteusCdbPinEntry(buffer, reference);
    components.push({
      reference,
      value,
      device,
      package: packageName,
      properties,
      pinEntryOffset: pinEntry && pinEntry !== "ambiguous" ? pinEntry.offset : null,
      pinEntryStatus: pinEntry === "ambiguous"
        ? "ambiguous"
        : pinEntry
          ? "decoded"
          : "unavailable",
      pins: pinEntry && pinEntry !== "ambiguous" ? pinEntry.pins : [],
    });
  }

  return components.sort((left, right) => left.reference.localeCompare(right.reference));
}

function getAsciiMarkers(buffer: Buffer): string[] {
  const text = buffer.toString("latin1");
  const knownMarkers = ["page &p of &n", "Arial"];
  return knownMarkers.filter((marker) => text.includes(marker));
}

function getAsciiMarkerOffsets(
  buffer: Buffer,
): Array<{ marker: string; offset: number }> {
  const knownMarkers = ["page &p of &n", "Arial"];
  return knownMarkers
    .flatMap((marker) =>
      findAllBufferOccurrences(buffer, Buffer.from(marker, "ascii"))
        .map((offset) => ({ marker, offset })),
    )
    .sort((left, right) => left.offset - right.offset);
}

function getNewWaveTextFields(buffer: Buffer): NewWaveTextField[] {
  const markerOffsets = getAsciiMarkerOffsets(buffer);
  return markerOffsets.map(({ marker, offset }) => {
    const encoded = Buffer.from(marker, "ascii");
    const lengthPrefixOffset = offset > 0 ? offset - 1 : null;
    const declaredLength = lengthPrefixOffset === null
      ? null
      : buffer[lengthPrefixOffset];
    return {
      marker,
      offset,
      lengthPrefixOffset,
      declaredLength,
      decodedLength: encoded.length,
      status: declaredLength === encoded.length
        ? "length-prefix-validated"
        : "marker-only",
    };
  });
}

function inspectNewWaveDocument(
  format: "livewire" | "pcb-wizard",
  buffer: Buffer,
): NewWaveInspection {
  if (buffer.length < 32 || !buffer.subarray(0, 4).equals(NEW_WAVE_MAGIC)) {
    throw new Error(`El archivo .${format === "livewire" ? "lvw" : "pcb"} no tiene la firma binaria Dsg esperada.`);
  }

  return {
    format,
    targetApplication: getTargetApplicationContext(format),
    recognized: true,
    byteLength: buffer.length,
    signature: "Dsg\\0",
    formatIdentification: {
      family: "New Wave Dsg",
      selectedBy: "file-extension",
      confidence: "shared-family-signature-plus-extension",
      applicationSpecificSignatureVerified: false,
    },
    textMarkers: getAsciiMarkers(buffer),
    textMarkerOffsets: getAsciiMarkerOffsets(buffer),
    textFields: getNewWaveTextFields(buffer),
    status: "recognized-binary-not-yet-decoded",
    componentDataDecoded: false,
    limitations: [
      "La firma identifica la familia binaria New Wave, pero no demuestra que se hayan decodificado sus componentes.",
      "La clasificación específica Livewire/PCB Wizard se basa en la extensión: ambas muestras comparten Dsg\\0 y el inspector no ha verificado una firma exclusiva de cada aplicación.",
      "Se decodifican los campos documentales page &p of &n y Arial cuando su byte de longitud anterior coincide con la longitud ASCII exacta; son metadatos del documento, no componentes ni conexiones.",
      "Todavía no se interpretan instancias, pines, propiedades eléctricas, nets, footprints ni pistas de cobre.",
      "No se genera ni modifica un archivo nativo de estos formatos en esta etapa.",
    ],
  };
}

function inspectProteusDocument(buffer: Buffer): ProteusInspection {
  const entries = parseZipDirectory(buffer);
  const byName = new Map(entries.map((entry) => [entry.name.toUpperCase(), entry]));
  const projectXml = byName.get("PROJECT.XML");
  const rootDsn = byName.get("ROOT.DSN");
  const rootCdb = byName.get("ROOT.CDB");

  if (!projectXml || !rootDsn) {
    throw new Error("El ZIP no parece un proyecto Proteus completo: requiere PROJECT.XML y ROOT.DSN.");
  }

  if (projectXml.uncompressedSize > MAX_PROJECT_XML_BYTES) {
    throw new Error("PROJECT.XML supera el límite de 2 MB.");
  }
  const projectXmlData = extractZipEntry(buffer, projectXml);
  const xmlText = projectXmlData.toString("utf8").trim();
  if (!xmlText.startsWith("<") || xmlText.includes("\u0000")) {
    throw new Error("PROJECT.XML no contiene XML de texto válido.");
  }

  // ROOT.CDB aporta metadatos y tablas de patas; la colocación, los slots WIRE,
  // la geometría de cables y los objetos POWER/GROUND se inspeccionan desde ROOT.DSN.
  const cdbComponents = rootCdb
    ? parseProteusCdbComponentMetadata(extractZipEntry(buffer, rootCdb))
    : [];
  const dsnBytes = extractZipEntry(buffer, rootDsn);
  const schematicComponents = parseProteusDsnComponentInstances(dsnBytes, cdbComponents);

  return {
    format: "proteus",
    targetApplication: getTargetApplicationContext("proteus"),
    recognized: true,
    byteLength: buffer.length,
    container: "zip",
    entries,
    hasProjectXml: true,
    hasRootDsn: true,
    hasRootCdb: Boolean(rootCdb),
    projectXmlBytes: projectXmlData.length,
    componentMetadata: {
      status: cdbComponents.length > 0 ? "partial" : "unavailable",
      source: rootCdb ? "ROOT.CDB" : null,
      count: cdbComponents.length,
      components: cdbComponents,
      limitations: [
        "ROOT.CDB aporta metadatos, propiedades y nombres/números de patas; no contiene por sí solo la colocación gráfica ni los punteros a WIRE, que se leen por separado desde ROOT.DSN.",
        "La existencia de un registro CDB no demuestra por sí misma que el componente esté colocado; las instancias se contrastan con los registros completos encontrados bajo OBJECT DATA en ROOT.DSN.",
        "El orden físico de los nombres de pata CDB depende de las definiciones $PIN de biblioteca; cuando esas definiciones no aparecen, la asociación se conserva como cdb-order-unverified.",
        "El lector se ha contrastado con la muestra de referencia del repositorio; necesita más fixtures reales de Proteus 8.13 antes de declararse general.",
      ],
    },
    schematicComponents,
    status: "recognized-project-with-partial-schematic-data",
    schematicDecoded: false,
    limitations: [
      "Se valida la estructura ZIP y PROJECT.XML; ROOT.DSN se decodifica parcialmente para recuperar registros de componentes, origen/orientación, geometría WIRE, nodos T y slots que apuntan a cables conocidos.",
      "La asociación entre slots y objetos WIRE se valida por sus punteros; los nombres físicos de patas permanecen sin confirmar cuando faltan definiciones $PIN coincidentes.",
      "Las agrupaciones geométricas todavía no son una netlist completa: faltan etiquetas/nombres de red, instrumentos virtuales, el cuerpo gráfico completo de símbolos y fixtures reales de terminales POWER/GROUND.",
      "La inspección no importa ni modifica el circuito, y no demuestra que el proyecto se abra o simule en Proteus 8.13.",
      "No se genera ni modifica un proyecto .pdsprj en esta etapa.",
    ],
  };
}

/**
 * Inspecciona una muestra nativa sin afirmar que su circuito ya fue decodificado.
 * Proteus se valida como contenedor ZIP; Livewire y PCB Wizard se reconocen por
 * la firma Dsg y la extensión original del archivo.
 */
export function inspectNativeEdaProject(
  fileName: string,
  input: Uint8Array,
): NativeEdaInspection {
  const buffer = Buffer.from(input);
  const extension = fileName.toLowerCase().split(".").pop();

  if (extension === "lvw") return inspectNewWaveDocument("livewire", buffer);
  if (extension === "pcb") return inspectNewWaveDocument("pcb-wizard", buffer);
  if (extension === "pdsprj") return inspectProteusDocument(buffer);

  throw new Error("Formato no admitido. Se esperan archivos .lvw, .pcb o .pdsprj.");
}


/**
 * Public read-only entry point for inspecting ROOT.DSN bytes independently of the
 * .pdsprj ZIP wrapper. Useful for focused parser regression tests and diagnostics.
 */
export function inspectProteusSchematicBytes(
  input: Uint8Array,
  libraryComponents: ProteusComponentMetadata[] = [],
): ProteusSchematicInspection {
  return parseProteusDsnComponentInstances(Buffer.from(input), libraryComponents);
}
