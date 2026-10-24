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

// Límite básico por IP para evitar bucles accidentales y abuso del endpoint.
// En despliegues con varias instancias, reemplazar por un limitador compartido.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 8;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-for");
  const clientIp = forwarded?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const current = rateBuckets.get(clientIp);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(clientIp, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (current.count >= RATE_MAX_REQUESTS) return false;
  current.count += 1;
  return true;
}


const terminalMap: Record<ComponentType, string[]> = {
  battery: ["positive", "negative"],
  resistor: ["a", "b"],
  led: ["anode", "cathode"],
  switch: ["a", "b"],
  ground: ["gnd"],
};

async function buildAiProposal(prompt: string): Promise<Omit<Proposal, "mode">> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Falta GEMINI_API_KEY en el entorno del servidor.");

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const systemInstruction = `Sos un asistente para propuestas preliminares de circuitos. Devolvé solo JSON con las claves title, explanation, components, wires, confirmedRequirements, assumptions, missingInformation y warnings. components es una lista de {type,x,y}; wires es una lista de {from:{componentIndex,terminalId},to:{componentIndex,terminalId}}. Tipos permitidos: battery (terminales positive,negative), resistor (a,b), led (anode,cathode), switch (a,b), ground (gnd). No inventes componentes ni terminales. Si el pedido requiere un tipo no disponible, no lo sustituyas silenciosamente: devuelve components y wires vacíos y explica qué falta. No afirmes que el circuito está eléctricamente validado ni simulado. Las coordenadas deben estar entre x=30..410 e y=40..290. Propiedades predeterminadas: batería 9 V, resistencia 220 ohm, LED Vf 2 V/20 mA. Marcá supuestos, faltantes y advertencias. Máximo 12 componentes y 20 cables.`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error("Se alcanzó la cuota gratuita o el límite de solicitudes de Gemini. Esperá a que se restablezca la cuota o revisá los límites de AI Studio.");
    if (response.status === 401 || response.status === 403) throw new Error("Gemini rechazó la clave. Revisá GEMINI_API_KEY y que la clave pertenezca a un proyecto habilitado.");
    if (response.status === 404) throw new Error("El modelo configurado no está disponible. Revisá GEMINI_MODEL en .env.local.");
    throw new Error("Gemini respondió con un error HTTP " + response.status + ". Revisá la configuración e intentá nuevamente.");
  }

  const payload: unknown = await response.json();
  if (typeof payload !== "object" || payload === null || !("candidates" in payload)) {
    throw new Error("La respuesta de Gemini no tiene el formato esperado.");
  }
  const candidates = (payload as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates;
  const raw = candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!raw) throw new Error("Gemini devolvió una respuesta vacía. Puede que el pedido haya sido bloqueado o que se haya agotado la cuota.");

  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("La respuesta de Gemini no era JSON válido."); }
  if (typeof parsed !== "object" || parsed === null) throw new Error("La propuesta de Gemini no tiene un objeto válido.");

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
      throw new Error("Gemini propuso un componente o coordenada no permitidos.");
    }
    return { type: component.type as ComponentType, x: Math.max(30, Math.min(410, component.x)), y: Math.max(40, Math.min(290, component.y)) };
  });

  const wires: ProposalWire[] = wiresRaw.map((item) => {
    if (typeof item !== "object" || item === null) throw new Error("Conexión inválida en la propuesta.");
    const wire = item as Record<string, unknown>;
    const parseEnd = (end: unknown) => {
      if (typeof end !== "object" || end === null) throw new Error("Terminal inválido en la propuesta.");
      const terminal = end as Record<string, unknown>;
      if (!Number.isInteger(terminal.componentIndex) || typeof terminal.terminalId !== "string") throw new Error("Referencia de terminal inválida.");
      const index = terminal.componentIndex as number;
      if (index < 0 || index >= components.length || !terminalMap[components[index].type].includes(terminal.terminalId)) throw new Error("Gemini hizo referencia a un terminal que no existe.");
      return { componentIndex: index, terminalId: terminal.terminalId };
    };
    const from = parseEnd(wire.from), to = parseEnd(wire.to);
    if (from.componentIndex === to.componentIndex && from.terminalId === to.terminalId) throw new Error("Gemini propuso conectar un terminal consigo mismo.");
    return { from, to };
  });

  const connectionKeys = new Set<string>();
  for (const wire of wires) {
    const key = [`${wire.from.componentIndex}:${wire.from.terminalId}`, `${wire.to.componentIndex}:${wire.to.terminalId}`].sort().join("<->");
    if (connectionKeys.has(key)) throw new Error("Gemini propuso una conexión duplicada.");
    connectionKeys.add(key);
  }
  const stringList = (key: string): string[] => {
    const entry = value[key];
    return Array.isArray(entry) ? entry.filter((item): item is string => typeof item === "string").slice(0, 10) : [];
  };
  return {
    title: typeof value.title === "string" ? value.title.slice(0, 120) : "Propuesta de circuito",
    explanation: typeof value.explanation === "string" ? value.explanation.slice(0, 1200) : "",
    components, wires,
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
  if (!checkRateLimit(request)) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Esperá un minuto antes de volver a intentarlo." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }
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

    if (process.env.GEMINI_API_KEY) {
      const proposal = await buildAiProposal(prompt);
      return NextResponse.json({ mode: "ai", ...proposal });
    }

    return NextResponse.json(buildDemoProposal(prompt));
  } catch (error) {
    // Los errores de proveedor/configuración no son errores del texto enviado por el usuario.
    const message = error instanceof Error ? error.message : "";
    const isProviderFailure = Boolean(process.env.GEMINI_API_KEY);
    // No devolver detalles internos ni respuestas crudas del proveedor al navegador.
    const safeMessage = message.includes("Falta GEMINI_API_KEY")
      ? "Falta configurar GEMINI_API_KEY en .env.local."
      : message.includes("cuota gratuita") || message.includes("límite de solicitudes") || message.includes("Gemini respondió")
        ? message
        : message.includes("no existe") || message.includes("inválid") || message.includes("JSON")
          ? message
          : "Falló la generación. Revisá la configuración del proveedor e intentá nuevamente.";
    return NextResponse.json(
      {
        error: isProviderFailure
          ? safeMessage
          : "No se pudo interpretar la solicitud. Intentá de nuevo.",
      },
      { status: isProviderFailure ? 502 : 400 },
    );
  }
}
