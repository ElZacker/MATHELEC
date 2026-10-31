export type NativeEdaFormat = "livewire" | "pcb-wizard" | "proteus";

export type CompatibilityLevel =
  | "verified"
  | "partial"
  | "signature-only"
  | "presence-only"
  | "not-applicable"
  | "not-implemented"
  | "not-verified";

export type NativeEdaInteroperabilityPath = {
  sourceFormat: NativeEdaFormat;
  targetFormat: NativeEdaFormat;
  method: "open-livewire-file-and-convert-in-target";
  evidenceUrl: string;
  vendorDocumented: true;
  applicationSmokeTested: false;
};

const LIVEWIRE_TO_PCB_WIZARD_PATH: NativeEdaInteroperabilityPath = {
  sourceFormat: "livewire",
  targetFormat: "pcb-wizard",
  method: "open-livewire-file-and-convert-in-target",
  evidenceUrl: "https://www.new-wave-concepts.com/ed/pw_faq.html",
  vendorDocumented: true,
  applicationSmokeTested: false,
};

export type NativeEdaCompatibilityProfile = {
  format: NativeEdaFormat;
  documentedInteroperability: NativeEdaInteroperabilityPath[];
  application: string;
  installedVersion: string;
  versionSource: "user-confirmed";
  versionDetectedInsideFile: false;
  extension: string;
  capabilities: {
    fileRecognition: CompatibilityLevel;
    containerIntegrity: CompatibilityLevel;
    projectMetadata: CompatibilityLevel;
    circuitImport: CompatibilityLevel;
    nativeExport: CompatibilityLevel;
    applicationOpenTest: CompatibilityLevel;
    simulationOrRoutingTest: CompatibilityLevel;
    roundTripTest: CompatibilityLevel;
  };
  knownFacts: string[];
  nextEvidenceRequired: string[];
};

const PROFILES: readonly NativeEdaCompatibilityProfile[] = [
  {
    format: "livewire",
    documentedInteroperability: [LIVEWIRE_TO_PCB_WIZARD_PATH],
    application: "Livewire",
    installedVersion: "1.11",
    versionSource: "user-confirmed",
    versionDetectedInsideFile: false,
    extension: ".lvw",
    capabilities: {
      fileRecognition: "signature-only",
      containerIntegrity: "not-applicable",
      projectMetadata: "signature-only",
      circuitImport: "not-implemented",
      nativeExport: "not-implemented",
      applicationOpenTest: "not-verified",
      simulationOrRoutingTest: "not-verified",
      roundTripTest: "not-verified",
    },
    knownFacts: [
      "La muestra Mathelecprueba.lvw mide 1.144 bytes y comienza con la firma Dsg\\0.",
      "La muestra contiene los marcadores de texto page &p of &n y Arial.",
      "La firma Dsg\\0 también aparece en la muestra PCB Wizard; no identifica por sí sola la aplicación.",
    ],
    nextEvidenceRequired: [
      "Más proyectos Livewire 1.11 con circuitos distintos y conocidos, guardados desde la aplicación.",
      "Comparación controlada entre proyectos con un componente, valor, conexión y posición modificados de a uno.",
      "Comprobación de apertura y simulación del archivo generado dentro de Livewire 1.11.",
    ],
  },
  {
    format: "pcb-wizard",
    documentedInteroperability: [LIVEWIRE_TO_PCB_WIZARD_PATH],
    application: "PCB Wizard",
    installedVersion: "3.50",
    versionSource: "user-confirmed",
    versionDetectedInsideFile: false,
    extension: ".pcb",
    capabilities: {
      fileRecognition: "signature-only",
      containerIntegrity: "not-applicable",
      projectMetadata: "signature-only",
      circuitImport: "not-implemented",
      nativeExport: "not-implemented",
      applicationOpenTest: "not-verified",
      simulationOrRoutingTest: "not-verified",
      roundTripTest: "not-verified",
    },
    knownFacts: [
      "La muestra Mathelecprueba.pcb mide 1.093 bytes y comienza con la firma Dsg\\0.",
      "La muestra comparte con Livewire la firma inicial, pero los datos binarios posteriores no son idénticos.",
      "Los marcadores page &p of &n y Arial no describen componentes ni pistas de cobre.",
    ],
    nextEvidenceRequired: [
      "Proyectos PCB Wizard 3.50 que incluyan placa, footprints, pads numerados, nets y pistas.",
      "Una muestra que contenga al menos un componente y una pista, con sus conexiones identificadas.",
      "Comprobación de apertura, conectividad de pads y reglas de ruteo dentro de PCB Wizard 3.50.",
    ],
  },
  {
    format: "proteus",
    documentedInteroperability: [],
    application: "Proteus",
    installedVersion: "8.13",
    versionSource: "user-confirmed",
    versionDetectedInsideFile: false,
    extension: ".pdsprj",
    capabilities: {
      fileRecognition: "verified",
      containerIntegrity: "partial",
      projectMetadata: "partial",
      circuitImport: "not-implemented",
      nativeExport: "not-implemented",
      applicationOpenTest: "not-verified",
      simulationOrRoutingTest: "not-verified",
      roundTripTest: "not-verified",
    },
    knownFacts: [
      "La muestra mathelecprueba.pdsprj mide 12.281 bytes y es un contenedor ZIP.",
      "El contenedor incluye PROJECT.XML, ROOT.DSN y ROOT.CDB.",
      "Mathelect recupera metadatos de componentes desde ROOT.CDB y referencias/valores de los registros COMPONENT ID de ROOT.DSN; todavía no reconstruye coordenadas, símbolos, pines ni redes eléctricas.",
    ],
    nextEvidenceRequired: [
      "Decodificación contrastada de coordenadas, símbolos, pines, cables y redes eléctricas de ROOT.DSN.",
      "Mapeo verificable entre referencias de ROOT.DSN y registros de ROOT.CDB.",
      "Apertura y simulación del proyecto generado dentro de Proteus 8.13.",
    ],
  },
];

export function getNativeEdaCompatibilityMatrix(): NativeEdaCompatibilityProfile[] {
  return PROFILES.map((profile) => ({
    ...profile,
    capabilities: { ...profile.capabilities },
    documentedInteroperability: profile.documentedInteroperability.map((path) => ({ ...path })),
    knownFacts: [...profile.knownFacts],
    nextEvidenceRequired: [...profile.nextEvidenceRequired],
  }));
}

export function getNativeEdaCompatibilityProfile(
  format: NativeEdaFormat,
): NativeEdaCompatibilityProfile {
  const profile = PROFILES.find((candidate) => candidate.format === format);
  if (!profile) throw new Error(`No existe un perfil de compatibilidad para ${format}.`);
  return {
    ...profile,
    capabilities: { ...profile.capabilities },
    documentedInteroperability: profile.documentedInteroperability.map((path) => ({ ...path })),
    knownFacts: [...profile.knownFacts],
    nextEvidenceRequired: [...profile.nextEvidenceRequired],
  };
}

export function getNativeEdaCompatibilityProfileForFile(
  fileName: string,
): NativeEdaCompatibilityProfile | null {
  const extension = fileName.toLowerCase().split(".").pop();
  const profile = PROFILES.find((candidate) => candidate.extension.slice(1) === extension);
  return profile ? getNativeEdaCompatibilityProfile(profile.format) : null;
}
