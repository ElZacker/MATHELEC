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

export type CompatibilityMilestoneStatus = "complete" | "partial" | "pending";

export type NativeEdaCompatibilityMilestone = {
  id: string;
  label: string;
  status: CompatibilityMilestoneStatus;
  evidence: string;
};

export type NativeEdaProgress = {
  percent: number;
  completedCount: number;
  partialCount: number;
  totalCount: number;
  note: string;
  milestones: NativeEdaCompatibilityMilestone[];
};

function createNativeEdaProgress(
  milestones: NativeEdaCompatibilityMilestone[],
): NativeEdaProgress {
  const completedCount = milestones.filter((milestone) => milestone.status === "complete").length;
  const partialCount = milestones.filter((milestone) => milestone.status === "partial").length;
  const weightedPoints = completedCount + partialCount * 0.5;
  return {
    percent: milestones.length > 0 ? Math.round((weightedPoints / milestones.length) * 100) : 0,
    completedCount,
    partialCount,
    totalCount: milestones.length,
    note: "Estimación de hitos técnicos: completo = 1 punto, parcial = 0,5 y pendiente = 0. No representa el porcentaje de archivos compatibles ni de importación/exportación funcional.",
    milestones,
  };
}

export type NativeEdaCompatibilityProfile = {
  progress: NativeEdaProgress;
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
    progress: createNativeEdaProgress([
      { id: "family-signature", label: "Reconocimiento de familia binaria", status: "partial", evidence: "La muestra contiene Dsg\\0; la selección Livewire/PCB Wizard depende de la extensión y no hay firma exclusiva confirmada." },
      { id: "document-markers", label: "Campos documentales con longitud", status: "complete", evidence: "En la muestra real, page &p of &n está precedido por 0x0D y Arial por 0x05; ambos prefijos coinciden con la longitud ASCII y tienen regresiones." },
      { id: "component-records", label: "Componentes, terminales y propiedades", status: "pending", evidence: "No se decodifican registros de componentes ni propiedades eléctricas." },
      { id: "placement-symbols", label: "Posiciones y geometría de símbolos", status: "pending", evidence: "No se reconstruyen coordenadas, símbolos ni orientación." },
      { id: "connectivity", label: "Cables y conectividad eléctrica", status: "pending", evidence: "No se reconstruyen terminales, nets ni conexiones." },
      { id: "internal-import", label: "Importación al modelo interno", status: "pending", evidence: "No existe importador nativo Livewire." },
      { id: "native-export", label: "Exportación nativa", status: "pending", evidence: "No existe escritor .lvw." },
      { id: "application-roundtrip", label: "Apertura y prueba de ida/vuelta", status: "pending", evidence: "No se ha abierto un archivo generado en Livewire 1.11 ni validado su simulación." },
    ]),
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
      "La muestra contiene page &p of &n (prefijo 0x0D en offset 89) y Arial (prefijo 0x05 en offset 103); ambos campos son length-prefixed ASCII validados por el inspector.",
      "La muestra comparte los primeros 38 bytes con PCB Wizard, pero diverge a partir del offset 38; el formato concreto no se identifica solo con la firma Dsg.",

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
    progress: createNativeEdaProgress([
      { id: "family-signature", label: "Reconocimiento de familia binaria", status: "partial", evidence: "La muestra contiene Dsg\\0, compartido con Livewire; la extensión identifica el destino de forma contextual." },
      { id: "document-markers", label: "Campos documentales con longitud", status: "complete", evidence: "En la muestra real, page &p of &n está precedido por 0x0D y Arial por 0x05; ambos prefijos coinciden con la longitud ASCII y tienen regresiones." },
      { id: "board-outline", label: "Contorno y capas de placa", status: "pending", evidence: "No se decodifican límites de placa ni capas." },
      { id: "footprints-pads", label: "Footprints y pads numerados", status: "pending", evidence: "No se decodifican huellas, pads ni coordenadas." },
      { id: "nets-tracks", label: "Nets y pistas de cobre", status: "pending", evidence: "No se reconstruyen redes ni pistas." },
      { id: "internal-import", label: "Importación al modelo interno", status: "pending", evidence: "No existe importador de PCB Wizard." },
      { id: "native-export", label: "Exportación nativa", status: "pending", evidence: "No existe escritor .pcb." },
      { id: "application-roundtrip", label: "Apertura y prueba de ida/vuelta", status: "pending", evidence: "No se ha abierto una placa generada en PCB Wizard 3.50 ni ejecutado su verificador de ruteo." },
    ]),
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
      "page &p of &n (prefijo 0x0D en offset 89) y Arial (prefijo 0x05 en offset 103) se decodifican como campos documentales length-prefixed ASCII; no describen componentes ni pistas de cobre.",
      "La muestra comparte los primeros 38 bytes con Livewire, pero diverge a partir del offset 38; el formato concreto no se identifica solo con la firma Dsg.",

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
    progress: createNativeEdaProgress([
      { id: "container-integrity", label: "Contenedor ZIP y archivos esenciales", status: "complete", evidence: "La fixture valida el ZIP, PROJECT.XML, ROOT.DSN, ROOT.CDB, tamaños y CRC32." },
      { id: "component-records", label: "Instancias y metadatos de componentes", status: "complete", evidence: "B1, D1 y R1 se decodifican y se contrastan con ROOT.CDB; objetos sin designador quedan sin resolver." },
      { id: "placement", label: "Origen, rotación y espejo", status: "complete", evidence: "Los registros colocados de B1, D1 y R1 exponen origen físico, ángulo, espejo y slots exactos con regresiones." },
      { id: "wire-geometry", label: "Geometría WIRE y nodos T", status: "partial", evidence: "Se decodifican los seis WIRE de la muestra y sus grupos/contactos geométricos; aún no equivalen a nets completas." },
      { id: "slot-wire-links", label: "Slots de componente enlazados a WIRE", status: "partial", evidence: "Los punteros exactos resuelven a objetos WIRE, pero el orden físico de nombres CDB no se confirma sin $PIN." },
      { id: "physical-pin-geometry", label: "Identidad y geometría física de patas", status: "pending", evidence: "La fixture no contiene definiciones $PIN coincidentes para BATTERY, LED-RED y 10WATT1K." },
      { id: "power-ground-real-fixture", label: "Terminales POWER/GROUND con fixture real", status: "partial", evidence: "El parser y la geometría tienen prueba sintética; falta una instancia guardada desde Proteus 8.13." },
      { id: "labels-instruments-symbols", label: "Etiquetas, instrumentos y cuerpo de símbolos", status: "pending", evidence: "Faltan net labels, instrumentos virtuales y geometría gráfica completa." },
      { id: "complete-netlist", label: "Netlist eléctrica completa", status: "pending", evidence: "Los grupos geométricos no constituyen todavía un grafo eléctrico completo." },
      { id: "internal-import", label: "Importación editable a Mathelect", status: "pending", evidence: "El inspector informa datos; no reemplaza ni crea el circuito actual." },
      { id: "native-export", label: "Exportación nativa .pdsprj", status: "pending", evidence: "No existe escritor de proyecto Proteus." },
      { id: "application-roundtrip", label: "Apertura, simulación y round-trip", status: "pending", evidence: "No se ha validado un proyecto generado dentro de Proteus 8.13." },
    ]),
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
      "Los objetos de OBJECT DATA sin designador o con referencias repetidas se conservan como no resueltos.",
      "El lector recupera bloques de etiquetas, dispositivo, origen físico, orientación, flag de espejo y tabla exacta de slots de cada componente colocado.",
      "ROOT.CDB aporta nombres/números de patas y ROOT.DSN aporta la tabla exacta de slots WIRE; la búsqueda de definiciones $PIN no encuentra cabeceras de BATTERY, LED-RED o 10WATT1K en el fixture actual.",
      "Los objetos POWER/GROUND tienen un lector de origen, anclaje, punto de conexión y puntero WIRE; la cobertura automatizada de terminales es sintética porque la muestra del repositorio no contiene instancias colocadas.",
      "El inspector decodifica registros WIRE validados en cadenas de vértices int32 y agrupa segmentos que se tocan mediante vértices situados sobre los segmentos de otros cables; no fusiona cruces interiores sin vértices.",
      "ROOT.CDB aporta nombres/números de patas y ROOT.DSN una tabla exacta de slots WIRE; la asociación slot→cable se valida por puntero, pero la asociación nombre físico de pata→slot solo se confirma con una definición $PIN, ausente para los tres dispositivos de este fixture.",
      "wireConnectedGroups agrupa cables, nodos T, asociaciones provisionales de pata por orden CDB (cdb-order-unverified) y terminales POWER/GROUND con puntero y punto geométrico válidos; faltan definiciones $PIN y etiquetas de red para una netlist totalmente verificada.",
      "Se conservan además los offsets y ventanas de marcadores WIRE/OBJECT DATA, junto con offsets TERMINAL, TERMINAL LABEL y PROPERTIES.",
      "La extracción de instancias está automatizada y probada contra la muestra del repositorio; un segundo proyecto externo fue inspeccionado manualmente para estudiar objetos de instrumento y límites de sección, pero no es todavía una fixture de CI.",
      "La reconstrucción sigue siendo parcial: falta la geometría del cuerpo gráfico completo, las etiquetas/nombres de red, instrumentos virtuales y la netlist completa.",
    ],
    nextEvidenceRequired: [
      "Conseguir proyectos 8.13 que incluyan cabeceras de definición de biblioteca para validar $PIN, puntos físicos, rotación y espejo; la muestra actual solo permite mantener asociaciones provisionales por CDB.",
      "Decodificar etiquetas de red, clases/nombres de terminal, instrumentos virtuales y el cuerpo gráfico completo de símbolos para validar una netlist completa en Proteus 8.13.",
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
    progress: { ...profile.progress, milestones: profile.progress.milestones.map((milestone) => ({ ...milestone })) },
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
    progress: { ...profile.progress, milestones: profile.progress.milestones.map((milestone) => ({ ...milestone })) },
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
