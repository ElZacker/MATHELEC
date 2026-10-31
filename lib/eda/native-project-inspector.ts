import { inflateRawSync } from "node:zlib";

export type NativeEdaFormat = "livewire" | "pcb-wizard" | "proteus";

export type NewWaveInspection = {
  format: "livewire" | "pcb-wizard";
  recognized: true;
  byteLength: number;
  signature: "Dsg\\0";
  textMarkers: string[];
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

export type ProteusInspection = {
  format: "proteus";
  recognized: true;
  byteLength: number;
  container: "zip";
  entries: ProteusZipEntry[];
  hasProjectXml: boolean;
  hasRootDsn: boolean;
  hasRootCdb: boolean;
  projectXmlBytes: number | null;
  status: "recognized-project-with-binary-schematic";
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

function getAsciiMarkers(buffer: Buffer): string[] {
  const text = buffer.toString("latin1");
  const knownMarkers = ["page &p of &n", "Arial"];
  return knownMarkers.filter((marker) => text.includes(marker));
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
    recognized: true,
    byteLength: buffer.length,
    signature: "Dsg\\0",
    textMarkers: getAsciiMarkers(buffer),
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

  // Validar también que el diseño binario se encuentre dentro del contenedor.
  // El contenido ROOT.DSN se mantiene opaco hasta contar con un decodificador verificado.
  return {
    format: "proteus",
    recognized: true,
    byteLength: buffer.length,
    container: "zip",
    entries,
    hasProjectXml: true,
    hasRootDsn: true,
    hasRootCdb: Boolean(rootCdb),
    projectXmlBytes: projectXmlData.length,
    status: "recognized-project-with-binary-schematic",
    schematicDecoded: false,
    limitations: [
      "Se valida la estructura ZIP, PROJECT.XML y la presencia de ROOT.DSN; esto no equivale a reconstruir el esquema.",
      "ROOT.DSN y ROOT.CDB siguen siendo datos binarios sin decodificador verificado.",
      "No se extraen ni se reconstruyen todavía componentes, pines, valores, redes, modelos o posiciones de Proteus.",
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
