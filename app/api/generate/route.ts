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
  response: string;
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

async function buildAiProposal(prompt: string, currentCircuit: { components: { type: string; label: string; position: { x: number; y: number } }[]; wires: { from: { componentId: string; terminalId: string }; to: { componentId: string; terminalId: string } }[] }): Promise<Omit<Proposal, "mode">> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Falta GEMINI_API_KEY en el entorno del servidor.");

  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const circuitContext = JSON.stringify(currentCircuit);
  const systemInstruction = `Sos Mathelect, un asistente conversacional en español natural, cálido y directo. Adaptá la longitud al pedido: para saludos y acciones simples, respondé en 1-3 frases claras; para preguntas técnicas, explicá el porqué y los pasos útiles; si el usuario pide detalle, desarrollá la respuesta sin quedarte en una frase genérica. No termines siempre con una pregunta innecesaria. Cuando agregues un componente, confirmá cuál agregaste y, si es relevante, explicá brevemente su función o qué falta para usarlo; no afirmes que un circuito está completo si no lo está. No muestres títulos robóticos, listas de metadatos ni advertencias genéricas en cada turno. Devolvé JSON con response, title, explanation, components, wires, confirmedRequirements, assumptions, missingInformation y warnings. El circuito actual se incluye como contexto y debe preservarse salvo que el usuario pida explícitamente modificarlo. components y wires son elementos nuevos únicamente. Para conectar o borrar elementos existentes, describí claramente en response qué se necesita; no afirmes que lo hiciste si el formato no permite ejecutar esa acción. Tipos disponibles: battery, resistor, led, switch, ground. Terminales: battery positive/negative, resistor a/b, led anode/cathode, switch a/b, ground gnd. Coordenadas x=30..410, y=40..290. No inventes componentes ni terminales. Máximo 12 componentes nuevos y 20 cables nuevos. Si no se modifica el circuito, devolvé listas vacías sin convertirlo en error. No afirmes validación o simulación eléctrica. `;
  // HTTP 503/504 significa saturación temporal del proveedor. Si el modelo elegido
  // sigue saturado, intentamos un modelo alternativo general en lugar de fallar enseguida.
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.6-flash";
  const modelsToTry = [...new Set([model, fallbackModel])];
  let response: Response | undefined;
  let lastTransientError: unknown;
  let activeModel = model;

  for (const candidateModel of modelsToTry) {
    activeModel = candidateModel;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${candidateModel}:generateContent?key=${apiKey}`;
    const requestBody = JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: "user", parts: [{ text: "PEDIDO DEL USUARIO:\\n" + prompt + "\\n\\nESTADO ACTUAL DEL CIRCUITO (solo contexto; no lo recrees):\\n" + circuitContext }] }],
      generationConfig: {
        // Reservar pocos tokens para acciones simples reduce la latencia; las consultas técnicas
        // reciben más espacio para explicar sin imponer respuestas largas a cada turno.
        maxOutputTokens: /\\b(explic[aá]|detall|paso a paso|por qué|por que|compar|informe|completo|desarroll)\\b/i.test(prompt) ? 1536 : prompt.length < 90 ? 512 : 1024,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingLevel: "LOW" },
      },
    });

    // Dos intentos por modelo, con una espera corta para errores transitorios.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
          signal: AbortSignal.timeout(30000),
        });
        if (response.ok) break;
        if (response.status !== 503 && response.status !== 504) break;
        lastTransientError = new Error(`Gemini ${candidateModel} respondió HTTP ${response.status}`);
      } catch (error) {
        lastTransientError = error;
        const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
        if (!timedOut) throw error;
      }
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (response?.ok) break;
    if (response && response.status !== 503 && response.status !== 504) break;
    response = undefined;
  }

  if (!response) {
    throw lastTransientError instanceof Error
      ? new Error(lastTransientError.message + ". Se intentó el modelo principal y el alternativo.")
      : new Error("Gemini no respondió. Se intentaron el modelo principal y el alternativo.");
  }

  if (!response.ok) {
    let providerMessage = "";
    try {
      const errorPayload = await response.json() as { error?: { message?: string; status?: string } };
      providerMessage = typeof errorPayload.error?.message === "string" ? errorPayload.error.message : "";
    } catch {}
    // Mensajes accionables; nunca incluir la clave en la respuesta al navegador.
    if (response.status === 429) throw new Error("Gemini agotó la cuota o el límite de solicitudes del nivel gratuito. Revisá el uso y los límites del proyecto en Google AI Studio y probá más tarde.");
    if (response.status === 401 || response.status === 403) throw new Error("Gemini rechazó la clave o el acceso a la API (HTTP " + response.status + "). Verificá que GEMINI_API_KEY sea la clave de AI Studio correcta y que la API Gemini esté habilitada para ese proyecto.");
    if (response.status === 404) throw new Error("Gemini no encontró el modelo '" + activeModel + "' (HTTP 404). Cambiá GEMINI_MODEL o GEMINI_FALLBACK_MODEL por un modelo disponible para tu proyecto.");
    if (response.status === 400) throw new Error("Gemini rechazó la solicitud (HTTP 400)." + (providerMessage ? " Detalle: " + providerMessage.slice(0, 240) : " Revisá el modelo y el formato de la solicitud."));
    throw new Error("Gemini respondió HTTP " + response.status + "." + (providerMessage ? " Detalle: " + providerMessage.slice(0, 240) : " Revisá la configuración e intentá nuevamente."));
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

  const wireWarnings: string[] = [];
  const normalizeTerminal = (type: ComponentType, terminalId: string): string | null => {
    const allowed = terminalMap[type];
    if (allowed.includes(terminalId)) return terminalId;
    const aliases: Record<string, string> = {
      plus: "positive", vcc: "positive", minus: "negative",
      ground: "gnd", left: "a", input: "a", start: "a",
      right: "b", output: "b", end: "b",
    };
    const alias = aliases[terminalId.toLowerCase()];
    if (alias && allowed.includes(alias)) return alias;
    if (allowed.length === 2 && terminalId.toLowerCase() === "a") return allowed[0];
    if (allowed.length === 2 && terminalId.toLowerCase() === "b") return allowed[1];
    if (allowed.length === 2 && terminalId.toLowerCase() === "positive") return allowed[0];
    if (allowed.length === 2 && terminalId.toLowerCase() === "negative") return allowed[1];
    return null;
  };
  const wires: ProposalWire[] = [];
  for (const item of wiresRaw) {
    if (typeof item !== "object" || item === null) {
      wireWarnings.push("Se omitió una conexión con formato inválido.");
      continue;
    }
    const wire = item as Record<string, unknown>;
    const parseEnd = (end: unknown): { componentIndex: number; terminalId: string } | null => {
      if (typeof end !== "object" || end === null) return null;
      const terminal = end as Record<string, unknown>;
      if (!Number.isInteger(terminal.componentIndex) || typeof terminal.terminalId !== "string") return null;
      const index = terminal.componentIndex as number;
      if (index < 0 || index >= components.length) return null;
      const terminalId = normalizeTerminal(components[index].type, terminal.terminalId);
      if (!terminalId) return null;
      return { componentIndex: index, terminalId };
    };
    const from = parseEnd(wire.from), to = parseEnd(wire.to);
    if (!from || !to) {
      wireWarnings.push("Se omitió un cable porque la IA indicó un terminal que no existe; el resto de la propuesta se conservó.");
      continue;
    }
    if (from.componentIndex === to.componentIndex && from.terminalId === to.terminalId) {
      wireWarnings.push("Se omitió una conexión que intentaba conectar un terminal consigo mismo.");
      continue;
    }
    wires.push({ from, to });
  }

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
    response: typeof value.response === "string" ? value.response.slice(0, 2000) : (typeof value.explanation === "string" ? value.explanation.slice(0, 1200) : "Listo. ¿Qué te gustaría hacer con el circuito?"),
    title: typeof value.title === "string" ? value.title.slice(0, 120) : "Propuesta de circuito",
    explanation: typeof value.explanation === "string" ? value.explanation.slice(0, 1200) : "",
    components, wires,
    confirmedRequirements: stringList("confirmedRequirements"),
    assumptions: stringList("assumptions"),
    missingInformation: stringList("missingInformation"),
    warnings: [...stringList("warnings"), ...wireWarnings],
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
      const rawCircuit = "currentCircuit" in body ? body.currentCircuit : null;
      const currentCircuit = rawCircuit && typeof rawCircuit === "object" && "components" in rawCircuit && Array.isArray(rawCircuit.components) && "wires" in rawCircuit && Array.isArray(rawCircuit.wires)
        ? rawCircuit as { components: { type: string; label: string; position: { x: number; y: number } }[]; wires: { from: { componentId: string; terminalId: string }; to: { componentId: string; terminalId: string } }[] }
        : { components: [], wires: [] };
      const proposal = await buildAiProposal(prompt, currentCircuit);
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
      : message.includes("cuota") || message.includes("límite de solicitudes") || message.includes("Gemini respondió") || message.includes("Gemini agotó") || message.includes("Gemini rechazó") || message.includes("Gemini no encontró")
        ? message
        : message.includes("no existe") || message.includes("inválid") || message.includes("JSON") || message.includes("terminal") || message.includes("componente") || message.includes("coordenada")
          ? message
          : error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
            ? "Gemini tardó demasiado en responder. Probá nuevamente en unos segundos."
            : error instanceof TypeError
              ? "No se pudo conectar con Gemini desde el servidor. Revisá la conexión a Internet y reiniciá npm run dev."
              : "Falló la generación por un error inesperado. Reiniciá npm run dev y volvé a probar.";
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
