import { NextResponse } from "next/server";
import { getAvailableComponentTypes } from "@/lib/circuits/components";
import type { ComponentType } from "@/lib/circuits/types";

type ProposalComponent = { type: ComponentType; x: number; y: number };
type ProposalWire = {
  from: { componentIndex: number; terminalId: string };
  to: { componentIndex: number; terminalId: string };
};
type Proposal = {
  mode: "demo";
  title: string;
  explanation: string;
  components: ProposalComponent[];
  wires: ProposalWire[];
  confirmedRequirements: string[];
  assumptions: string[];
  missingInformation: string[];
  warnings: string[];
};

const supportedTypes = new Set<string>(getAvailableComponentTypes());

const terminalMap: Record<ComponentType, string[]> = {
  battery: ["positive", "negative"],
  resistor: ["a", "b"],
  led: ["anode", "cathode"],
  switch: ["a", "b"],
  ground: ["gnd"],
};

async function buildAiProposal(prompt: string): Promise<Omit<Proposal, "mode">> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Falta OPENAI_API_KEY en el entorno del servidor.");

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Sos un asistente para propuestas preliminares de circuitos. Devolvé solo JSON con las claves title, explanation, components, wires, confirmedRequirements, assumptions, missingInformation y warnings. components es una lista de {type,x,y}; wires es una lista de {from:{componentIndex,terminalId},to:{componentIndex,terminalId}}. Tipos permitidos: battery (terminales positive,negative), resistor (a,b), led (anode,cathode), switch (a,b), ground (gnd). No inventes componentes ni terminales. Si el pedido requiere un tipo no disponible, no lo sustituyas silenciosamente: devuelve components y wires vacíos y explica qué falta. No afirmes que el circuito está eléctricamente validado ni simulado. Las coordenadas deben estar entre x=30..410 e y=40..290. Propiedades predeterminadas: batería 9 V, resistencia 220 ohm, LED Vf 2 V/20 mA. Marcá supuestos, faltantes y advertencias. Máximo 12 componentes y 20 cables.`,
        },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    throw new Error(response.status === 429
      ? "Se alcanzó el límite de solicitudes del proveedor de IA."
      : "El proveedor de IA respondió con un error. Revisá la configuración del servidor.");
  }

  const payload: unknown = await response.json();
  if (typeof payload !== "object" || payload === null || !("choices" in payload)) {
    throw new Error("La respuesta del proveedor de IA no tiene el formato esperado.");
  }
  const choices = (payload as { choices?: { message?: { content?: string } }[] }).choices;
  const raw = choices?.[0]?.message?.content;
  if (!raw || typeof raw !== "string") throw new Error("El proveedor de IA devolvió una respuesta vacía.");

  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("La respuesta de IA no era JSON válido."); }
  if (typeof parsed !== "object" || parsed === null) throw new Error("La propuesta de IA no tiene un objeto válido.");

  const value = parsed as Record<string, unknown>;
  const componentsRaw = value.components;
  const wiresRaw = value.wires;
  if (!Array.isArray(componentsRaw) || !Array.isArray(wiresRaw) ||
      componentsRaw.length > 12 || wiresRaw.length > 20) {
    throw new Error("La propuesta excede los límites o no contiene listas válidas.");
  }

  const components: ProposalComponent[] = componentsRaw.map((item) => {
    if (typeof item !== "object" || item === null) throw new Error("Componente inválido en la propuesta.");
    const component = item as Record<string, unknown>;
    if (typeof component.type !== "string" || !supportedTypes.has(component.type) ||
        typeof component.x !== "number" || !Number.isFinite(component.x) ||
        typeof component.y !== "number" || !Number.isFinite(component.y)) {
      throw new Error("La IA propuso un componente o coordenada no permitidos.");
    }
    return {
      type: component.type as ComponentType,
      x: Math.max(30, Math.min(410, component.x)),
      y: Math.max(40, Math.min(290, component.y)),
    };
  });

  const wires: ProposalWire[] = wiresRaw.map((item) => {
    if (typeof item !== "object" || item === null) throw new Error("Conexión inválida en la propuesta.");
    const wire = item as Record<string, unknown>;
    const parseEnd = (end: unknown) => {
      if (typeof end !== "object" || end === null) throw new Error("Terminal inválido en la propuesta.");
      const terminal = end as Record<string, unknown>;
      if (!Number.isInteger(terminal.componentIndex) || typeof terminal.terminalId !== "string") {
        throw new Error("Referencia de terminal inválida.");
      }
      const index = terminal.componentIndex as number;
      if (index < 0 || index >= components.length ||
          !terminalMap[components[index].type].includes(terminal.terminalId)) {
        throw new Error("La IA hizo referencia a un terminal que no existe.");
      }
      return { componentIndex: index, terminalId: terminal.terminalId };
    };
    const from = parseEnd(wire.from);
    const to = parseEnd(wire.to);
    if (from.componentIndex === to.componentIndex && from.terminalId === to.terminalId) {
      throw new Error("La IA propuso conectar un terminal consigo mismo.");
    }
    return { from, to };
  });

  // Rechazar conexiones duplicadas aunque la IA las devuelva en orden inverso.
  const connectionKeys = new Set<string>();
  for (const wire of wires) {
    const ends = [
      `${wire.from.componentIndex}:${wire.from.terminalId}`,
      `${wire.to.componentIndex}:${wire.to.terminalId}`,
    ].sort();
    const key = ends.join("<->");
    if (connectionKeys.has(key)) {
      throw new Error("La IA propuso una conexión duplicada.");
    }
    connectionKeys.add(key);
  }

  const stringList = (key: string): string[] => {
    const entry = value[key];
    return Array.isArray(entry) ? entry.filter((item): item is string => typeof item === "string").slice(0, 10) : [];
  };
  return {
    title: typeof value.title === "string" ? value.title.slice(0, 120) : "Propuesta de circuito",
    explanation: typeof value.explanation === "string" ? value.explanation.slice(0, 1200) : "",
    components,
    wires,
    confirmedRequirements: stringList("confirmedRequirements"),
    assumptions: stringList("assumptions"),
    missingInformation: stringList("missingInformation"),
    warnings: [...stringList("warnings"), "Propuesta generada por IA; requiere revisión humana y validación eléctrica independiente."],
  };
}


function buildDemoProposal(prompt: string): Proposal {
  const text = prompt.toLocaleLowerCase("es");
  const asksBlink = /intermit|parpade|555|temporiz/.test(text);

  // Reconocer tipos y cantidades explícitas (por ejemplo, "3 resistencias y 2 LED").
  const quantityByType: Partial<Record<ComponentType, number>> = {};
  const addIfMentioned = (type: ComponentType, pattern: RegExp) => {
    const match = text.match(pattern);
    if (match) quantityByType[type] = Math.max(1, Math.min(8, Number(match[1] || 1)));
  };
  addIfMentioned("battery", /(?:\\b(\\d+)\\s*)?(?:bater[ií]as?|pilas|fuentes)\\b/);
  addIfMentioned("resistor", /(?:\\b(\\d+)\\s*)?(?:resistencias?|resistores?)\\b/);
  addIfMentioned("led", /(?:\\b(\\d+)\\s*)?(?:leds?|diodos?)\\b/);
  addIfMentioned("switch", /(?:\\b(\\d+)\\s*)?(?:interruptores?|llaves|switches)\\b/);
  addIfMentioned("ground", /(?:\\b(\\d+)\\s*)?(?:tierras|masas|grounds?|gnds?)\\b/);

  const requested = Object.keys(quantityByType) as ComponentType[];
  const asksForCircuit = /\\b(circuito|conect|armar|crear|generar|agrega|agreg[aá]|añad|pon[eé]|necesito|quiero)\\b/.test(text);
  const recognized = requested.length > 0;
  if (!recognized) {
    return {
      mode: "demo",
      title: "No reconocí componentes de la biblioteca",
      explanation: "El modo demostración identifica menciones de los componentes disponibles, pero todavía no interpreta cualquier pedido como lo haría un modelo de IA.",
      components: [],
      wires: [],
      confirmedRequirements: [],
      assumptions: [],
      missingInformation: [
        "Probá nombrar batería, resistencia, LED, interruptor o tierra.",
        "Indicá cantidades, por ejemplo: «2 LED y 3 resistencias».",
        "Explicá qué querés que haga el circuito.",
      ],
      warnings: ["MODO DEMOSTRACIÓN: no se consultó ningún modelo de IA."],
    };
  }

  const expandedTypes = requested.flatMap((type) =>
    Array.from({ length: quantityByType[type] ?? 1 }, () => type)
  ).slice(0, 12);
  const layoutPositions = [
    { x: 90, y: 70 }, { x: 220, y: 70 }, { x: 350, y: 70 },
    { x: 350, y: 180 }, { x: 220, y: 180 }, { x: 90, y: 180 },
    { x: 90, y: 270 }, { x: 220, y: 270 }, { x: 350, y: 270 },
    { x: 160, y: 125 }, { x: 285, y: 225 }, { x: 160, y: 225 },
  ];
  const components: ProposalComponent[] = expandedTypes.map((type, index) => ({
    type,
    ...layoutPositions[index],
  }));

  const hasLed = expandedTypes.includes("led");
  const hasBattery = expandedTypes.includes("battery");
  const hasResistor = expandedTypes.includes("resistor");
  const canSuggestLedCircuit = hasLed && asksForCircuit && hasBattery && hasResistor;

  let wires: ProposalWire[] = [];
  let explanation = "Se identificaron los componentes mencionados y se colocaron en el área de propuesta. Todavía no se dedujeron conexiones, porque una mención de componentes no alcanza para determinar una topología fiable.";
  const assumptions: string[] = [];
  const missingInformation: string[] = [];

  if (canSuggestLedCircuit) {
    const batteryIndex = expandedTypes.indexOf("battery");
    const resistorIndex = expandedTypes.indexOf("resistor");
    const ledIndex = expandedTypes.indexOf("led");
    // Recorrido cerrado visualmente, con componentes en posiciones escalonadas.
    wires = [
      { from: { componentIndex: batteryIndex, terminalId: "positive" }, to: { componentIndex: resistorIndex, terminalId: "a" } },
      { from: { componentIndex: resistorIndex, terminalId: "b" }, to: { componentIndex: ledIndex, terminalId: "anode" } },
      { from: { componentIndex: ledIndex, terminalId: "cathode" }, to: { componentIndex: batteryIndex, terminalId: "negative" } },
    ];
    explanation = "Propuesta preliminar con batería, resistencia y LED conectados en un lazo cerrado. Los componentes se distribuyen en una disposición escalonada, no en una única línea. Revisá los valores reales antes de construirlo.";
    assumptions.push("Se usan los valores predeterminados de la biblioteca: batería de 9 V, resistencia de 220 Ω y LED de Vf 2 V.");
    missingInformation.push("Las cantidades adicionales se colocan en el esquema, pero no se conectan automáticamente sin una función definida para ellas.");
    missingInformation.push("Confirmar que la resistencia y la corriente sean adecuadas para el LED real.");
  } else {
    missingInformation.push("Indicá qué componentes deben conectarse entre sí y qué función debe cumplir el circuito.");
  }

  if (asksBlink) {
    missingInformation.push("La biblioteca no incluye un temporizador como el NE555; no se puede proponer un circuito de parpadeo completo.");
  }

  return {
    mode: "demo",
    title: asksBlink
      ? "Propuesta parcial: faltan componentes para el parpadeo"
      : canSuggestLedCircuit && hasBattery && hasResistor
        ? "Propuesta de circuito LED básico"
        : "Componentes reconocidos en tu pedido",
    explanation,
    components,
    wires,
    confirmedRequirements: requested.map((type) => ({
      battery: "Se solicitó una batería o fuente.",
      resistor: "Se solicitó una resistencia.",
      led: "Se solicitó un LED o diodo.",
      switch: "Se solicitó un interruptor.",
      ground: "Se solicitó una conexión a tierra o masa.",
    })[type] + (quantityByType[type] && quantityByType[type]! > 1 ? " Cantidad solicitada: " + quantityByType[type] + "." : "")),
    assumptions,
    missingInformation,
    warnings: [
      "MODO DEMOSTRACIÓN: estas reglas locales no son un modelo de IA.",
      "La propuesta no está simulada ni eléctricamente validada.",
    ],
  };
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("prompt" in body) ||
      typeof body.prompt !== "string"
    ) {
      return NextResponse.json(
        { error: "El campo prompt debe ser un texto." },
        { status: 400 },
      );
    }

    const prompt = body.prompt.trim();
    if (!prompt) {
      return NextResponse.json({ error: "Escribí qué circuito querés proponer." }, { status: 400 });
    }
    if (prompt.length > 2000) {
      return NextResponse.json({ error: "El pedido no puede superar los 2000 caracteres." }, { status: 413 });
    }

    if (process.env.OPENAI_API_KEY) {
      const proposal = await buildAiProposal(prompt);
      return NextResponse.json({ mode: "ai", ...proposal });
    }

    return NextResponse.json(buildDemoProposal(prompt));
  } catch (error) {
    // Los errores de proveedor/configuración no son errores del texto enviado por el usuario.
    const message = error instanceof Error ? error.message : "";
    const isProviderFailure = Boolean(process.env.OPENAI_API_KEY);
    return NextResponse.json(
      {
        error: isProviderFailure
          ? (message || "Falló la generación con el proveedor de IA. Revisá la configuración del servidor.")
          : "No se pudo interpretar la solicitud. Intentá de nuevo.",
      },
      { status: isProviderFailure ? 502 : 400 },
    );
  }
}
