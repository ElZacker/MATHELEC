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
      "Mathelect limita las instancias colocadas a los marcadores COMPONENT ID dentro de OBJECT DATA, obtiene valor, identificador de biblioteca y todas las propiedades de texto, y contrasta biblioteca/dispositivo con ROOT.CDB.",
      "Los objetos de OBJECT DATA sin designador o con referencias repetidas se conservan como no resueltos; se preservan también dos palabras binarias posteriores al designador como datos opacos, sin afirmar que sean coordenadas.",
      "Para B1, D1 y R1, las dos palabras binarias posteriores al designador son divisibles exactamente por 2540 al interpretarse como int32 con signo y generan candidatos X/Y en mils; siguen sin confirmación mediante guardados controlados.",
      "El inspector decodifica registros WIRE validados en cadenas de vértices int32 y agrupa segmentos que se tocan mediante vértices situados sobre los segmentos de otros cables; no fusiona cruces interiores sin vértices.",
      "ROOT.CDB aporta tablas de patas con nombre/número y ROOT.DSN sus slots de punteros WIRE; cuando el número de slots coincide y cada puntero resuelve, el informe enlaza pata→cable por orden de tabla.",
      "wireConnectedGroups agrupa cables, nodos T validados y patas de componentes ya enlazadas; las etiquetas de red y los terminales de alimentación/tierra todavía no se incluyen.",
      "Se conservan además los offsets y ventanas de marcadores WIRE/OBJECT DATA, junto con offsets TERMINAL, TERMINAL LABEL y PROPERTIES.",
      "La extracción de instancias está automatizada y probada contra la muestra del repositorio; un segundo proyecto externo fue inspeccionado manualmente para estudiar objetos de instrumento y límites de sección, pero no es todavía una fixture de CI.",
      "No se reconstruyen posiciones gráficas confirmadas: solo se exponen candidatos X/Y no verificados para tres instancias; tampoco se reconstruyen símbolos, geometría física de pines ni nets eléctricos completos.",
    ],
    nextEvidenceRequired: [
      "Confirmar con archivos Proteus 8.13 guardados antes/después de mover un solo componente si los candidatos X/Y representan coordenadas absolutas, origen local u otro campo que use la misma escala.",
      "Decodificar geometría/orientación de símbolos y coordenadas físicas de cada pin; resolver terminales de alimentación/tierra y etiquetas de red, instrumentos y objetos especiales, y validar nets completos.",
      "Validación automatizada sobre varios proyectos Proteus 8.13 y mapeo completo con ROOT.CDB.",
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
