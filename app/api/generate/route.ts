import { NextResponse } from "next/server";
import { getAvailableComponentTypes, getComponentDefinition } from "@/lib/circuits/components";
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
  actions?: Record<string, unknown>[];
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


const terminalMap = Object.fromEntries(getAvailableComponentTypes().map((type) => [type, getComponentDefinition(type).terminals.map((terminal) => terminal.id)])) as Record<ComponentType, string[]>;

async function buildAiProposal(prompt: string, currentCircuit: { components: { type: string; label: string; position: { x: number; y: number } }[]; wires: { from: { componentId: string; terminalId: string }; to: { componentId: string; terminalId: string } }[] }): Promise<Omit<Proposal, "mode">> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Falta GEMINI_API_KEY en el entorno del servidor.");

  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const circuitContext = JSON.stringify(currentCircuit);
  const systemInstruction = `Sos Mathelect, un asistente conversacional en español natural, cálido y directo. Adaptá la longitud al pedido: para saludos y acciones simples, respondé en 1-3 frases claras; para preguntas técnicas, explicá el porqué y los pasos útiles; si el usuario pide detalle, desarrollá la respuesta sin quedarte en una frase genérica. No termines siempre con una pregunta innecesaria. Si preguntan cuáles son tus capacidades, respondé de forma concreta y honesta: podés explicar electrónica, proponer circuitos con toda la biblioteca disponible, añadir uno o varios componentes, conectar y desconectar cables, rotar/mover/eliminar componentes, cambiar propiedades admitidas, explicar errores y sugerir sustitutos; no podés simular eléctricamente ni garantizar que un circuito funcione, y no debes afirmar capacidades inexistentes. Si el usuario pide diseñar, generar, crear o armar un circuito, la salida debe incluir conexiones eléctricas válidas por defecto; jamás entregues componentes sueltos solo por comodidad. Solo omitas cables si el usuario pide explícitamente "sin conexiones", "sin conectar" o equivalente. Cada conexión debe usar terminales reales y respetar polaridad, función, requisitos eléctricos y límites físicos; no inventes una topología que no puedas justificar. Antes de elegir componentes, identifica la función del circuito, calcula valores básicos cuando sea posible y explica límites relevantes (por ejemplo, un detector de conductancia cutánea no demuestra que alguien mienta). Si faltan datos críticos, usa supuestos explícitos y conservadores o pregunta, sin presentar el diseño como validado. Si piden un circuito aleatorio, elegí un diseño didáctico coherente y conectado; si es complejo, divide en etapas funcionales conectadas y explica lo que no puede verificarse. En pedidos singulares como “agrega otro LED”, ejecutá exactamente una unidad salvo que indiquen una cantidad distinta; no dupliques acciones. Para desconectar, usa una acción disconnect por cada pareja de componentes conectada que el usuario indique, sin tocar cables no relacionados. Si solicitan un componente inexistente, explicá cuál falta y ofrecé la alternativa más cercana disponible, sin inventar que existe. Cuando agregues un componente, confirmá cuál agregaste y, si es relevante, explicá brevemente su función o qué falta para usarlo; no afirmes que un circuito está completo si no lo está. No muestres títulos robóticos, listas de metadatos ni advertencias genéricas en cada turno. Devolvé JSON con response, title, explanation, components, wires, actions, confirmedRequirements, assumptions, missingInformation y warnings. Interpretá TODAS las instrucciones del usuario usando el estado completo del circuito actual como contexto; nunca ejecutes acciones por palabras clave en el servidor o el cliente. El circuito actual debe preservarse salvo que el usuario pida modificarlo. Para editar elementos existentes, devolvé acciones en actions: add_component {type, componentType, x, y}; rotate_component {type, reference, quarterTurns}; move_component {type, reference, x, y}; delete_component {type, reference}; connect {type, fromReference, fromTerminal, toReference, toTerminal}; disconnect {type, fromReference, toReference}; clear_circuit {type}; update_properties {type, reference, properties}. Usá las referencias visibles como R1, D1, BAT1, SW1 y GND1; podés usar los IDs incluidos en el contexto si hace falta. Las terminales válidas están descritas por cada componente en el contexto; nunca inventes terminales. Para añadir componentes nuevos, preferí acciones add_component cuando se trate de una edición incremental. Para generar un circuito desde cero o una propuesta de varios componentes, usá components y wires como elementos nuevos. Si el usuario dice que elijas vos, que sea aleatorio o pide componentes conectados sin especificar cuáles, elegí una combinación coherente y realizá el cambio en vez de pedirle que elija. Si pide conectar componentes que ya están colocados, conectá los existentes usando sus referencias y terminales reales. Si pide agregar un componente conectado, agregá el componente y conectalo a la topología existente cuando sea eléctricamente razonable. No devuelvas una acción si no estás seguro de qué elemento quiere modificar el usuario: preguntá en response y dejá actions vacías. La rotación es de 90 grados por cuarto de vuelta y quarterTurns puede ser 1, 2, 3 o 4. Máximo 30 componentes totales y 40 cables nuevos. No afirmes validación o simulación eléctrica. Tipos y terminales disponibles (fuente de verdad): ${JSON.stringify(Object.fromEntries(getAvailableComponentTypes().map((type) => [type, getComponentDefinition(type).terminals.map((terminal) => ({ id: terminal.id, name: terminal.name }))])))}. Usá únicamente estos tipos y terminales. Coordenadas x=30..410, y=40..290. Distribuí los componentes como un esquema electrónico convencional: fuente a la izquierda, protección/entrada primero, procesamiento en el centro y carga/salida a la derecha; usá filas alineadas, separación suficiente para etiquetas y cables, evitá superposiciones y priorizá recorridos ordenados. No inventes componentes ni terminales. Máximo 30 componentes totales y 40 cables nuevos. Respeta la cantidad exacta solicitada; “otro/un/una” significa exactamente uno. Si no se modifica el circuito, devolvé listas vacías sin convertirlo en error. No afirmes validación o simulación eléctrica. La salida debe ser JSON completo y válido, sin Markdown, sin comentarios, sin texto antes o después del objeto. Mantené response breve y priorizá la validez de la estructura, índices de componentes correctos y terminales existentes. `;
  // HTTP 503/504 significa saturación temporal del proveedor. Si el modelo elegido
  // sigue saturado, intentamos un modelo alternativo general en lugar de fallar enseguida.
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.8-flash";
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
        maxOutputTokens: /\b(aleatori|complej|todos|biblioteca|componentes conectados|conectalos|conectá|conecta|circuito)\b/i.test(prompt) ? 3072 : /\b(explic[aá]|detall|paso a paso|por qué|por que|compar|informe|completo|desarroll)\b/i.test(prompt) ? 2048 : prompt.length < 90 ? 1536 : 2048,
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

  // Algunos modelos envuelven el JSON en bloques Markdown o agregan texto alrededor.
  // Extraemos el objeto completo antes de fallar, sin hacer una segunda llamada lenta al modelo.
  const candidatesToParse = [
    raw,
    raw.replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/, "").trim(),
  ];
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidatesToParse.push(raw.slice(firstBrace, lastBrace + 1));
  }
  let parsed: unknown;
  let parseSucceeded = false;
  for (const candidate of candidatesToParse) {
    try {
      parsed = JSON.parse(candidate);
      parseSucceeded = true;
      break;
    } catch {
      // Probar la siguiente representación candidata.
    }
  }
  if (!parseSucceeded) {
    // Recuperación puntual: si Gemini truncó el JSON, pedir una versión completa
    // antes de descartar el cambio. Solo se usa cuando falla el parseo inicial.
    try {
      const repairEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`;
      const repairResponse = await fetch(repairEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: "Sos un reparador estricto de JSON. Devolvé un único objeto JSON completo, válido y sin Markdown. Conservá el significado y completá solo lo necesario para que el esquema sea válido. El objeto debe contener response, title, explanation, components, wires, actions, confirmedRequirements, assumptions, missingInformation y warnings." }] },
          contents: [{ role: "user", parts: [{ text: "Repará este JSON incompleto de Mathelect y devolvé el objeto completo. Tipos disponibles: " + JSON.stringify(getAvailableComponentTypes()) + "\\nJSON truncado:\\n" + raw }] }],
          generationConfig: { responseMimeType: "application/json", maxOutputTokens: 3072, thinkingConfig: { thinkingLevel: "LOW" } },
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (repairResponse.ok) {
        const repairPayload = await repairResponse.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const repairedRaw = repairPayload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() ?? "";
        const repairedCandidates = [repairedRaw, repairedRaw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()];
        const repairedStart = repairedRaw.indexOf("{");
        const repairedEnd = repairedRaw.lastIndexOf("}");
        if (repairedStart >= 0 && repairedEnd > repairedStart) repairedCandidates.push(repairedRaw.slice(repairedStart, repairedEnd + 1));
        for (const candidate of repairedCandidates) {
          try {
            parsed = JSON.parse(candidate);
            parseSucceeded = true;
            break;
          } catch {
            // Seguir probando las variantes de la respuesta reparada.
          }
        }
      }
    } catch {
      // Se mantiene el error original si también falla la recuperación.
    }
  }
  if (!parseSucceeded) {
    throw new Error("Gemini devolvió una respuesta incompleta o mal formada incluso después de intentar repararla. No se modificó el circuito.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("La propuesta de Gemini no tiene un objeto válido.");

  const value = parsed as Record<string, unknown>;
  // En ediciones incrementales Gemini puede omitir listas vacías; normalizarlas
  // evita descartar una acción válida solo porque no incluyó components/wires.
  const componentsRaw = Array.isArray(value.components) ? value.components : [];
  const wiresRaw = Array.isArray(value.wires) ? value.wires : [];
  if (componentsRaw.length > 30 || wiresRaw.length > 40) {
    throw new Error("La propuesta excede los límites de componentes o conexiones.");
  }

  const components: ProposalComponent[] = componentsRaw.map((item) => {
    if (typeof item !== "object" || item === null) throw new Error("Componente inválido en la propuesta.");
    const component = item as Record<string, unknown>;
    const rawType = typeof component.type === "string" ? component.type.trim().toLowerCase() : "";
    const typeAliases: Record<string, ComponentType> = {
      bateria: "battery", "batería": "battery", pila: "battery", fuente: "battery",
      resistencia: "resistor", resistor: "resistor", led: "led", diodo: "led",
      interruptor: "switch", llave: "switch", tierra: "ground", masa: "ground",
    };
    const normalizedType = supportedTypes.has(rawType) ? rawType as ComponentType : typeAliases[rawType];
    const x = typeof component.x === "number" && Number.isFinite(component.x) ? component.x : 220;
    const y = typeof component.y === "number" && Number.isFinite(component.y) ? component.y : 165;
    if (!normalizedType) throw new Error("Gemini propuso un tipo de componente no disponible en la biblioteca.");
    return { type: normalizedType, x: Math.max(30, Math.min(410, x)), y: Math.max(40, Math.min(290, y)) };
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
  // Si Gemini omitió todos los cables en un circuito nuevo, solo inferimos un lazo LED serie elemental.
  const explicitlyUnwired = /\b(sin conexiones|sin conectar|sin cables|componentes sueltos|no conectes|no conectar)\b/i.test(prompt);
  if (components.length > 1 && wires.length === 0 && !explicitlyUnwired) {
    const batteryIndex = components.findIndex((item) => ["battery", "cell", "voltage_source_dc"].includes(item.type));
    const resistorIndex = components.findIndex((item) => item.type === "resistor");
    const ledIndex = components.findIndex((item) => item.type === "led");
    const switchIndex = components.findIndex((item) => ["switch", "switch_spst"].includes(item.type));
    const simpleTypes = components.every((item) => ["battery", "cell", "voltage_source_dc", "resistor", "led", "switch", "switch_spst"].includes(item.type));
    if (simpleTypes && batteryIndex >= 0 && resistorIndex >= 0 && ledIndex >= 0 && components.length === (switchIndex >= 0 ? 4 : 3)) {
      const addWire = (fromIndex: number, fromTerminal: string, toIndex: number, toTerminal: string) =>
        wires.push({ from: { componentIndex: fromIndex, terminalId: fromTerminal }, to: { componentIndex: toIndex, terminalId: toTerminal } });
      addWire(batteryIndex, "positive", resistorIndex, "a");
      addWire(resistorIndex, "b", ledIndex, "anode");
      if (switchIndex >= 0) {
        addWire(ledIndex, "cathode", switchIndex, "a");
        addWire(switchIndex, "b", batteryIndex, "negative");
      } else addWire(ledIndex, "cathode", batteryIndex, "negative");
      components[batteryIndex] = { ...components[batteryIndex], x: 55, y: 165 };
      components[resistorIndex] = { ...components[resistorIndex], x: 165, y: 80 };
      components[ledIndex] = { ...components[ledIndex], x: 335, y: 165 };
      if (switchIndex >= 0) components[switchIndex] = { ...components[switchIndex], x: 165, y: 250 };
    }
  }
  // Acomodo determinista para el circuito LED serie común.
  if (components.length > 1 && wires.length > 0 && components.every((item) => ["battery", "cell", "voltage_source_dc", "resistor", "led", "switch", "switch_spst"].includes(item.type))) {
    const batteryIndex = components.findIndex((item) => ["battery", "cell", "voltage_source_dc"].includes(item.type));
    const resistorIndex = components.findIndex((item) => item.type === "resistor");
    const ledIndex = components.findIndex((item) => item.type === "led");
    const switchIndex = components.findIndex((item) => ["switch", "switch_spst"].includes(item.type));
    if (batteryIndex >= 0 && resistorIndex >= 0 && ledIndex >= 0) {
      components[batteryIndex] = { ...components[batteryIndex], x: 55, y: 165 };
      components[resistorIndex] = { ...components[resistorIndex], x: 165, y: 80 };
      components[ledIndex] = { ...components[ledIndex], x: 335, y: 165 };
      if (switchIndex >= 0) components[switchIndex] = { ...components[switchIndex], x: 165, y: 250 };
    }
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
    actions: Array.isArray(value.actions) ? value.actions.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item)).slice(0, 20) : [],
    confirmedRequirements: stringList("confirmedRequirements"),
    assumptions: stringList("assumptions"),
    missingInformation: stringList("missingInformation"),
    warnings: [...stringList("warnings"), ...wireWarnings],
  };
}

function buildDemoProposal(prompt: string): Proposal {
  const text = prompt.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const wantsBlink = /\b(parpade|intermit|titil|555|temporiz|oscilador)\w*/.test(text);
  const asksCapabilities = /\b(capacidades|que podes hacer|que puedes hacer|para que servis|que sabes hacer)\b/.test(text);
  if (asksCapabilities) return { mode: "demo", title: "Qué puede hacer Mathelect", explanation: "Puedo proponer circuitos con la biblioteca, añadir componentes, definir conexiones, explicar componentes y señalar piezas que falten. La edición exacta depende de que el modelo Gemini esté configurado; sin la clave, el modo demostración reconoce solo algunas solicitudes. No ejecuto simulación eléctrica ni puedo garantizar el funcionamiento físico.", response: "Puedo ayudarte a diseñar circuitos con los componentes de la biblioteca, explicar cómo funcionan, proponer conexiones, agregar o quitar componentes, rotarlos, moverlos y ajustar propiedades admitidas. También puedo señalar piezas faltantes y sugerir alternativas disponibles. Si Gemini está configurado, puedo interpretar instrucciones en lenguaje natural con más flexibilidad; sin esa configuración, algunas funciones quedan limitadas al modo demostración. No simulo eléctricamente el circuito ni garantizo que sea seguro construirlo.", components: [], wires: [], confirmedRequirements: [], assumptions: [], missingInformation: [], warnings: ["Las capacidades de edición avanzada requieren configurar GEMINI_API_KEY; el modo demostración no es una IA general."] };
  const wantsRandom = /\b(aleatorio|aleatoria|al azar|sorpresa|random)\b/.test(text) && /\b(circuito|generame|genera|crear|crea|arma|armar)\b/.test(text);
  const explicitlyUnwired = /\b(sin conexiones|sin conectar|sin cables|componentes sueltos|no conectes|no conectar)\b/.test(text);
  if (wantsRandom) {
    const components: ProposalComponent[] = [
      { type: "battery", x: 75, y: 165 },
      { type: "resistor", x: 220, y: 95 },
      { type: "led", x: 365, y: 165 },
      { type: "switch", x: 220, y: 245 },
    ];
    const wires: ProposalWire[] = explicitlyUnwired ? [] : [
      { from: { componentIndex: 0, terminalId: "positive" }, to: { componentIndex: 1, terminalId: "a" } },
      { from: { componentIndex: 1, terminalId: "b" }, to: { componentIndex: 2, terminalId: "anode" } },
      { from: { componentIndex: 2, terminalId: "cathode" }, to: { componentIndex: 3, terminalId: "a" } },
      { from: { componentIndex: 3, terminalId: "b" }, to: { componentIndex: 0, terminalId: "negative" } },
    ];
    return { mode: "demo", title: "Circuito sorpresa: LED con interruptor", explanation: "Circuito didáctico en serie: la batería alimenta la resistencia limitadora, el LED y el interruptor. Cerrá el interruptor para completar el lazo. Es una demostración conceptual, no una simulación.", response: "¡Dale! Armé un circuito sorpresa con batería, resistencia, LED e interruptor, con un lazo de conexiones completo. Revisá los valores y la polaridad antes de construirlo.", components, wires, confirmedRequirements: ["Fuente continua", "Resistencia limitadora", "LED polarizado", "Interruptor en serie"], assumptions: ["La batería usa el valor predeterminado de 9 V y la resistencia 220 Ω."], missingInformation: [], warnings: ["MODO DEMOSTRACIÓN: no se consultó Gemini ni se simuló el circuito eléctricamente."] };
  }
  const wantsAlarm = /\b(alarma|sensor de luz|ldr|fotoresist)\b/.test(text);
  const wantsCounter = /\b(contador|cd4017|decada)\b/.test(text);
  const asksForAction = /\b(agrega|agregá|añade|anade|pon|pone|quiero|necesito|crea|crear|arma|armar|diseña|disena|genera|generar|circuito|conecta|conectar)\b/.test(text);
  const requested = new Map<ComponentType, number>();
  const detect = (type: ComponentType, pattern: RegExp) => {
    const match = text.match(pattern);
    if (match) requested.set(type, Math.max(1, Math.min(8, Number(match[1] || 1))));
  };
  // El modo demo reconoce también toda la biblioteca; no depende de Gemini para añadir tipos simples.
  detect("battery", /\b(?:(\d+)\s*)?(?:baterias?|pilas|fuente continua|fuente de tension continua)\b/);
  detect("voltage_source_ac", /\b(?:(\d+)\s*)?(?:fuente(?:s)? de (?:tension )?altern(?:a|as)|corriente alterna|fuente ac|vac)\b/);
  detect("current_source", /\b(?:(\d+)\s*)?(?:fuente(?:s)? de corriente|current source)\b/);
  detect("resistor", /\b(?:(\d+)\s*)?(?:resistencias?|resistores?)\b/);
  detect("potentiometer", /\b(?:(\d+)\s*)?(?:potenciometros?|potenciómetros?|resistencias variables)\b/);
  detect("polarized_capacitor", /\b(?:(\d+)\s*)?(?:capacitores?|condensadores?) electroliticos?\b/);
  detect("capacitor", /\b(?:(\d+)\s*)?(?:(?:capacitores?|condensadores?)(?!\s+electroliticos?))\b/);
  detect("inductor", /\b(?:(\d+)\s*)?(?:inductores?|bobinas?)\b/);
  detect("led", /\b(?:(\d+)\s*)?leds?\b/);
  detect("zener_diode", /\b(?:(\d+)\s*)?(?:diodos? zener|zener)\b/);
  detect("photodiode", /\b(?:(\d+)\s*)?(?:fotodiodos?)\b/);
  detect("diode", /\b(?:(\d+)\s*)?diodos?(?!\s+zener)\b/);
  detect("ldr", /\b(?:(\d+)\s*)?(?:ldr|fotoresistencias?|fotorresistencias?)\b/);
  detect("thermistor", /\b(?:(\d+)\s*)?(?:termistores?|thermistors?)\b/);
  detect("switch", /\b(?:(\d+)\s*)?(?:interruptores?|llaves|switches)\b/);
  detect("push_button", /\b(?:(\d+)\s*)?(?:pulsadores?|botones de (?:presion|pulsacion))\b/);
  detect("fuse", /\b(?:(\d+)\s*)?(?:fusibles?)\b/);
  detect("relay", /\b(?:(\d+)\s*)?(?:reles?|relays?)\b/);
  detect("npn_transistor", /\b(?:(\d+)\s*)?(?:transistores? npn|npn)\b/);
  detect("pnp_transistor", /\b(?:(\d+)\s*)?(?:transistores? pnp|pnp)\b/);
  detect("mosfet_n", /\b(?:(\d+)\s*)?mosfet(?:s)?\s*(?:canal )?n\b/);
  detect("mosfet_p", /\b(?:(\d+)\s*)?mosfet(?:s)?\s*(?:canal )?p\b/);
  detect("op_amp", /\b(?:(\d+)\s*)?(?:amplificadores? operacionales?|op ?amps?)\b/);
  detect("logic_gate_and", /\b(?:(\d+)\s*)?(?:compuertas? and|puertas? and|and gate)\b/);
  detect("logic_gate_or", /\b(?:(\d+)\s*)?(?:compuertas? or|puertas? or|or gate)\b/);
  detect("logic_gate_not", /\b(?:(\d+)\s*)?(?:compuertas? not|puertas? not|inversores? logicos?)\b/);
  detect("ic_555", /\b(?:(\d+)\s*)?(?:ne ?555|ic ?555|temporizadores? 555)\b/);
  detect("ic_4017", /\b(?:(\d+)\s*)?(?:cd ?4017|ic ?4017)\b/);
  detect("motor", /\b(?:(\d+)\s*)?(?:motores?|motors?)\b/);
  detect("lamp", /\b(?:(\d+)\s*)?(?:lamparas?|bombillas?|focos?)\b/);
  detect("connector", /\b(?:(\d+)\s*)?(?:conectores?|terminales de conexion)\b/);
  detect("ground", /\b(?:(\d+)\s*)?(?:tierras|masas|grounds?|gnds?)\b/);
  const expanded = [...requested.entries()].flatMap(([type, count]) => Array.from({ length: count }, () => type)).slice(0, 30);
  const unsupported: string[] = [];
  if (/\b(bc547)\b/.test(text)) unsupported.push("BC547 (no hay modelo específico; alternativa: transistor NPN genérico)");
  if (expanded.length === 0) return { mode: "demo", response: "No reconocí componentes disponibles en el modo demostración.", title: "No reconocí componentes disponibles", explanation: "El modo demostración usa palabras clave y no tiene comprensión general como un modelo de IA. No sustituiré componentes faltantes por otros.", components: [], wires: [], confirmedRequirements: [], assumptions: [], missingInformation: ["Disponibles: batería/fuente, resistencia, LED/diodo, interruptor y tierra/masa.", ...(unsupported.length ? ["Faltan: " + unsupported.join("; ") + "."] : ["Indicá componentes y función del circuito."])], warnings: ["MODO DEMOSTRACIÓN: no se consultó un modelo de IA."] };
  const positions = Array.from({ length: 30 }, (_, index) => ({ x: 55 + (index % 6) * 70, y: 55 + Math.floor(index / 6) * 48 }));
  const components: ProposalComponent[] = expanded.map((type, index) => ({ type, ...positions[index] }));
  const hasBattery = expanded.includes("battery"), hasResistor = expanded.includes("resistor"), hasLed = expanded.includes("led");
  const simpleLed = asksForAction && hasBattery && hasResistor && hasLed && !wantsBlink && !wantsAlarm && !wantsCounter && !explicitlyUnwired;
  const wires: ProposalWire[] = [];
  if (simpleLed) {
    const bi = expanded.indexOf("battery"), ri = expanded.indexOf("resistor"), li = expanded.indexOf("led");
    wires.push({ from: { componentIndex: bi, terminalId: "positive" }, to: { componentIndex: ri, terminalId: "a" } });
    wires.push({ from: { componentIndex: ri, terminalId: "b" }, to: { componentIndex: li, terminalId: "anode" } });
    wires.push({ from: { componentIndex: li, terminalId: "cathode" }, to: { componentIndex: bi, terminalId: "negative" } });
  }
  const names: Partial<Record<ComponentType, string>> = { battery: "batería", resistor: "resistencia", led: "LED", diode: "diodo", switch: "interruptor", ground: "tierra", capacitor: "capacitor", polarized_capacitor: "capacitor polarizado", inductor: "inductor", npn_transistor: "transistor NPN", pnp_transistor: "transistor PNP", mosfet_n: "MOSFET N", mosfet_p: "MOSFET P", op_amp: "amplificador operacional", voltage_source_ac: "fuente CA", current_source: "fuente de corriente", fuse: "fusible", motor: "motor", lamp: "lámpara", push_button: "pulsador", relay: "relé", photodiode: "fotodiodo", ldr: "LDR", thermistor: "termistor", potentiometer: "potenciómetro", zener_diode: "diodo Zener", logic_gate_and: "puerta AND", logic_gate_or: "puerta OR", logic_gate_not: "puerta NOT", ic_555: "NE555", ic_4017: "CD4017", connector: "conector" };
  const confirmedRequirements = [...requested.entries()].map(([type, count]) => String(count) + " " + names[type] + (count > 1 ? "s" : ""));
  const missingInformation: string[] = [];
  if (wantsBlink) missingInformation.push("El NE555 está disponible, pero el modo demostración no construye automáticamente la topología completa de un oscilador. Con Gemini configurado, pedí el circuito astable con sus conexiones.");
  if (wantsAlarm) missingInformation.push("La biblioteca incluye LDR y transistores, pero el modo demostración no genera automáticamente la topología completa de una alarma. Con Gemini configurado, especificá el comportamiento esperado.");
  if (wantsCounter) missingInformation.push("El CD4017 está disponible, pero el modo demostración no diseña automáticamente un contador completo ni su fuente de pulsos. Con Gemini configurado, pedí el circuito por etapas.");
  if (!simpleLed) missingInformation.push("No se dedujeron conexiones porque el pedido no define una topología compatible con las reglas de demostración.");
  if (unsupported.length) missingInformation.push("Componentes no disponibles: " + unsupported.join("; ") + ".");
  return { mode: "demo", response: simpleLed ? "Preparé una demostración de un circuito LED básico." : "Reconocí algunos componentes para una demostración.", title: simpleLed ? "Propuesta de circuito LED básico" : "Componentes reconocidos según tu pedido", explanation: simpleLed ? "Lazo cerrado batería-resistencia-LED. Revisá valores y polaridad." : "Se colocaron los componentes reconocidos en una distribución no lineal, sin inventar conexiones.", components, wires, confirmedRequirements, assumptions: simpleLed ? ["Valores predeterminados: batería 9 V, resistencia 220 Ω, LED Vf 2 V."] : [], missingInformation, warnings: ["MODO DEMOSTRACIÓN: el reconocimiento por palabras clave no equivale a una IA general.", "No hay simulación eléctrica; revisá la propuesta antes de construirla."] };
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
              : message && !message.toLowerCase().includes("api key") && !message.toLowerCase().includes("authorization")
                ? "No se pudo completar la propuesta: " + message.slice(0, 220)
                : "Falló la generación por un error inesperado. Revisá la terminal donde corre npm run dev para ver el detalle.";
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
