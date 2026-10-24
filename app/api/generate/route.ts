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
  const text = prompt.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const wantsBlink = /\b(parpade|intermit|titil|555|temporiz|oscilador)\w*/.test(text);
  const wantsAlarm = /\b(alarma|sensor de luz|ldr|fotoresist)\b/.test(text);
  const wantsCounter = /\b(contador|cd4017|decada)\b/.test(text);
  const asksForAction = /\b(agrega|agregá|añade|anade|pon|pone|quiero|necesito|crea|crear|arma|armar|diseña|disena|genera|generar|circuito|conecta|conectar)\b/.test(text);
  const requested = new Map<ComponentType, number>();
  const detect = (type: ComponentType, pattern: RegExp) => {
    const match = text.match(pattern);
    if (match) requested.set(type, Math.max(1, Math.min(8, Number(match[1] || 1))));
  };
  detect("battery", /\b(?:(\d+)\s*)?(?:baterias?|pilas|fuentes)\b/);
  detect("resistor", /\b(?:(\d+)\s*)?(?:resistencias?|resistores?)\b/);
  detect("led", /\b(?:(\d+)\s*)?(?:leds?|diodos?)\b/);
  detect("switch", /\b(?:(\d+)\s*)?(?:interruptores?|llaves|switches)\b/);
  detect("ground", /\b(?:(\d+)\s*)?(?:tierras|masas|grounds?|gnds?)\b/);
  const expanded = [...requested.entries()].flatMap(([type, count]) => Array.from({ length: count }, () => type)).slice(0, 12);
  const unsupported: string[] = [];
  if (wantsBlink) unsupported.push("temporizador NE555 u otro oscilador");
  if (wantsAlarm) unsupported.push("sensor de luz/etapa de control");
  if (wantsCounter) unsupported.push("integrado CD4017 y fuente de pulsos");
  if (/\b(transistor|bc547|mosfet|capacitor|condensador|cd4017|555|ldr|fotoresistencia|potenciometro|bobina|inductor|motor|rele)\b/.test(text)) unsupported.push("componentes mencionados que no están en la biblioteca actual");
  if (expanded.length === 0) return { mode: "demo", title: "No reconocí componentes disponibles", explanation: "El modo demostración usa palabras clave y no tiene comprensión general como un modelo de IA. No sustituiré componentes faltantes por otros.", components: [], wires: [], confirmedRequirements: [], assumptions: [], missingInformation: ["Disponibles: batería/fuente, resistencia, LED/diodo, interruptor y tierra/masa.", ...(unsupported.length ? ["Faltan: " + unsupported.join("; ") + "."] : ["Indicá componentes y función del circuito."])], warnings: ["MODO DEMOSTRACIÓN: no se consultó un modelo de IA."] };
  const positions = [{x:75,y:80},{x:220,y:55},{x:360,y:90},{x:365,y:220},{x:220,y:265},{x:75,y:220},{x:145,y:135},{x:290,y:150},{x:145,y:235},{x:285,y:235},{x:215,y:145},{x:75,y:145}];
  const components: ProposalComponent[] = expanded.map((type, index) => ({ type, ...positions[index] }));
  const hasBattery = expanded.includes("battery"), hasResistor = expanded.includes("resistor"), hasLed = expanded.includes("led");
  const simpleLed = asksForAction && hasBattery && hasResistor && hasLed && !wantsBlink && !wantsAlarm && !wantsCounter;
  const wires: ProposalWire[] = [];
  if (simpleLed) {
    const bi = expanded.indexOf("battery"), ri = expanded.indexOf("resistor"), li = expanded.indexOf("led");
    wires.push({ from: { componentIndex: bi, terminalId: "positive" }, to: { componentIndex: ri, terminalId: "a" } });
    wires.push({ from: { componentIndex: ri, terminalId: "b" }, to: { componentIndex: li, terminalId: "anode" } });
    wires.push({ from: { componentIndex: li, terminalId: "cathode" }, to: { componentIndex: bi, terminalId: "negative" } });
  }
  const names: Record<ComponentType, string> = { battery: "batería/fuente", resistor: "resistencia", led: "LED/diodo", switch: "interruptor", ground: "tierra/masa" };
  const confirmedRequirements = [...requested.entries()].map(([type, count]) => String(count) + " " + names[type] + (count > 1 ? "s" : ""));
  const missingInformation: string[] = [];
  if (wantsBlink) missingInformation.push("Falta un temporizador/oscilador para hacer parpadear el LED; no está disponible en la biblioteca.");
  if (wantsAlarm) missingInformation.push("Faltan sensor de luz y etapa de control para una alarma funcional.");
  if (wantsCounter) missingInformation.push("Faltan CD4017 y fuente de pulsos para un contador digital.");
  if (!simpleLed) missingInformation.push("No se dedujeron conexiones porque el pedido no define una topología compatible con las reglas de demostración.");
  if (unsupported.length) missingInformation.push("Componentes no disponibles: " + unsupported.join("; ") + ".");
  return { mode: "demo", title: simpleLed ? "Propuesta de circuito LED básico" : "Componentes reconocidos según tu pedido", explanation: simpleLed ? "Lazo cerrado batería-resistencia-LED. Revisá valores y polaridad." : "Se colocaron los componentes reconocidos en una distribución no lineal, sin inventar conexiones.", components, wires, confirmedRequirements, assumptions: simpleLed ? ["Valores predeterminados: batería 9 V, resistencia 220 Ω, LED Vf 2 V."] : [], missingInformation, warnings: ["MODO DEMOSTRACIÓN: el reconocimiento por palabras clave no equivale a una IA general.", "No hay simulación eléctrica; revisá la propuesta antes de construirla."] };
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
