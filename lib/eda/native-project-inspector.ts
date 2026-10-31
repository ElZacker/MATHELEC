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

export type NewWaveInspection = {
  format: "livewire" | "pcb-wizard";
  targetApplication: TargetApplicationContext;
  recognized: true;
  byteLength: number;
  signature: "Dsg\\0";
  textMarkers: string[];
  textMarkerOffsets: Array<{ marker: string; offset: number }>;
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

export type ProteusComponentMetadata = {
  reference: string;
  value: string;
  device: string;
  package: string;
  properties: Record<string, string>;
};

export type ProteusComponentMetadataInspection = {
  status: "partial" | "unavailable";
  source: "ROOT.CDB" | null;
  count: number;
  components: ProteusComponentMetadata[];
  limitations: string[];
};

export type ProteusSchematicComponentInstance = {
  reference: string;
  sourceOffset: number;
  value: string | null;
  libraryName: string | null;
  libraryNameMatchesDeviceMetadata: boolean | null;
  properties: Record<string, string>;
  matchesComponentMetadata: boolean;
};

export type ProteusSchematicInspection = {
  status: "partial" | "unavailable";
  source: "ROOT.DSN";
  header: "ISIS SCHEMATIC FILE";
  objectDataSectionCount: number;
  componentIdMarkersOutsideObjectData: number;
  componentInstanceCount: number;
  componentInstances: ProteusSchematicComponentInstance[];
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
  for (const match of text.matchAll(/\\{([^{}=\\r\\n]{1,64})=([^{}\\r\\n]{0,256})\\}/g)) {
    const key = match[1].trim();
    if (!/^[A-Za-z][A-Za-z0-9_. -]*$/.test(key)) continue;
    if (!(key in properties)) properties[key] = match[2].trim();
  }
  return properties;
}

/**
 * Decodes the conservative component-instance subset of ROOT.DSN:
 * - component records anchored by "COMPONENT ID\\0";
 * - the nearest preceding FF-length-prefixed reference designator;
 * - the first FF-length-prefixed value immediately after the marker;
 * - printable PACKAGE / PRIMTYPE properties from the same record.
 *
 * This is not a full ISIS schematic decoder. In particular, it does not infer
 * graphical coordinates, symbol geometry, pin endpoints, wires or electrical nets.
 */
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
  const markersOutsideObjectData = offsets.filter((markerOffset) =>
    !objectDataOffsets.some((objectOffset) => objectOffset < markerOffset),
  ).length;
  const metadataReferences = new Set(libraryComponents.map((component) => component.reference));
  const seenReferences = new Set<string>();
  const componentInstances: ProteusSchematicComponentInstance[] = [];

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
    const searchStart = Math.max(objectDataOffset + objectDataMarker.length, markerOffset - 80);
    let reference: string | null = null;

    for (let candidate = markerOffset - 1; candidate >= searchStart; candidate -= 1) {
      if (buffer[candidate] !== 0xff) continue;
      const field = readProteusLengthPrefixedAscii(buffer, candidate, 16);
      if (field && isProteusDesignator(field.value)) {
        reference = field.value.trim();
        break;
      }
    }
    if (!reference || seenReferences.has(reference)) continue;

    const valueStart = markerOffset + marker.length;
    const valueLimit = Math.min(recordEnd, valueStart + 12);
    let value: string | null = null;
    for (let candidate = valueStart; candidate < valueLimit; candidate += 1) {
      if (buffer[candidate] !== 0xff) continue;
      const field = readProteusLengthPrefixedAscii(buffer, candidate, 128);
      if (field) {
        value = field.value;
        break;
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
      const libraryValueLimit = Math.min(recordEnd, libraryValueStart + 16);
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

    const metadata = libraryComponents.find((component) => component.reference === reference);
    const libraryNameMatchesDeviceMetadata = libraryName !== null && metadata
      ? libraryName.trim().toUpperCase() === metadata.device.trim().toUpperCase()
      : null;

    seenReferences.add(reference);
    componentInstances.push({
      reference,
      sourceOffset: markerOffset,
      value,
      libraryName,
      libraryNameMatchesDeviceMetadata,
      properties,
      matchesComponentMetadata: metadataReferences.has(reference),
    });
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
  const componentLibraryNamesWithoutDeviceMetadataMatch = componentInstances
    .filter((instance) => instance.libraryNameMatchesDeviceMetadata === false)
    .map((instance) => instance.reference)
    .sort((left, right) => left.localeCompare(right));

  return {
    status: componentInstances.length > 0 ? "partial" : "unavailable",
    source: "ROOT.DSN",
    header: "ISIS SCHEMATIC FILE",
    objectDataSectionCount: objectDataOffsets.length,
    componentIdMarkersOutsideObjectData: markersOutsideObjectData,
    componentInstanceCount: componentInstances.length,
    componentInstances,
    componentReferencesWithoutMetadata,
    metadataReferencesWithoutSchematicInstance,
    componentLibraryNamesWithoutDeviceMetadataMatch,
    limitations: [
      "Se reconocen registros COMPONENT ID dentro de secciones OBJECT DATA para evitar confundir definiciones de biblioteca con instancias colocadas.",
      "Se recuperan referencias y valores en formato FF + longitud + texto, junto con el offset del registro dentro de ROOT.DSN.",
      "Las propiedades PACKAGE y PRIMTYPE solo se conservan cuando aparecen como texto dentro del mismo registro.",
      "Se intenta recuperar el nombre de biblioteca después de COMPONENT VALUE; la comparación con el campo device de ROOT.CDB es solo diagnóstica, porque ambos identificadores pueden diferir.",
      "Las posiciones gráficas, los símbolos, la geometría y la orientación todavía no están decodificados.",
      "No se reconstruyen terminales, extremos de pines, cables ni nets eléctricos; no se puede afirmar que el circuito esté importado.",
      "El subconjunto se contrastó con una única muestra Proteus 8.13 y requiere más proyectos de referencia antes de considerarse general.",
    ],
  };
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
    components.push({ reference, value, device, package: packageName, properties });
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
    textMarkers: getAsciiMarkers(buffer),
    textMarkerOffsets: getAsciiMarkerOffsets(buffer),
    status: "recognized-binary-not-yet-decoded",
    componentDataDecoded: false,
    limitations: [
      "La firma identifica un documento binario de la familia New Wave, pero no demuestra que se hayan decodificado sus componentes.",
      "Livewire y PCB Wizard comparten la firma inicial; la extensión y el contexto del proyecto se usan para distinguirlos.",
      "Todavía no se interpretan instancias, pines, propiedades, nets, footprints ni pistas de cobre.",
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

  // ROOT.CDB contiene metadatos de la biblioteca/instancias. Esta lectura parcial
  // no reconstruye la colocación ni las conexiones del esquemático ROOT.DSN.
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
        "Se recuperan únicamente campos de metadatos de componente observados en ROOT.CDB: referencia, valor, dispositivo, paquete y propiedades de texto.",
        "Estos registros no prueban que cada componente esté colocado en ROOT.DSN ni indican su posición en la hoja.",
        "Todavía no se reconstruyen símbolos, patillajes físicos, cables, nodos eléctricos ni nets.",
        "El lector se ha contrastado con la muestra de referencia del repositorio; necesita más fixtures reales de Proteus 8.13 antes de declararse general.",
      ],
    },
    schematicComponents,
    status: "recognized-project-with-partial-schematic-data",
    schematicDecoded: false,
    limitations: [
      "Se valida la estructura ZIP y PROJECT.XML; ROOT.DSN y ROOT.CDB se inspeccionan solo parcialmente.",
      "La metadata parcial de ROOT.CDB no equivale a importar el circuito ni a recuperar su conectividad.",
      "No se extraen todavía posiciones, pines conectados, cables ni redes del esquemático Proteus.",
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
