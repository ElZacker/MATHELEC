import { NextResponse } from "next/server";
import { getAvailableComponentTypes } from "@/lib/circuits/components";
import type { ComponentType } from "@/lib/circuits/types";

export const runtime = "nodejs";

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
    return { from, to };
  });

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
  const text = prompt.toLowerCase();
  const asksLed = /led|diodo/.test(text);
  const asksBlink = /intermit|parpade|555|temporiz/.test(text);

  if (!asksLed) {
    return {
      mode: "demo",
      title: "Necesito más información",
      explanation:
        "El generador de esta etapa funciona en modo demostración y solo puede proponer estructuras con componentes de la biblioteca actual.",
      components: [],
      wires: [],
      confirmedRequirements: [],
      assumptions: [],
      missingInformation: [
        "Indicá qué debe hacer el circuito y qué componentes querés utilizar.",
        "La biblioteca actual solo incluye batería, resistencia, LED, interruptor y tierra.",
      ],
      warnings: [
        "Esta respuesta es una demostración local; todavía no se consultó ningún modelo de IA.",
      ],
    };
  }

  const components: ProposalComponent[] = [
    { type: "battery", x: 80, y: 100 },
    { type: "resistor", x: 190, y: 100 },
    { type: "led", x: 310, y: 100 },
  ];
  const wires: ProposalWire[] = [
    {
      from: { componentIndex: 0, terminalId: "positive" },
      to: { componentIndex: 1, terminalId: "a" },
    },
    {
      from: { componentIndex: 1, terminalId: "b" },
      to: { componentIndex: 2, terminalId: "anode" },
    },
    {
      from: { componentIndex: 2, terminalId: "cathode" },
      to: { componentIndex: 0, terminalId: "negative" },
    },
  ];

  return {
    mode: "demo",
    title: asksBlink
      ? "Propuesta parcial: LED con alimentación y resistencia"
      : "Propuesta de circuito LED básico",
    explanation: asksBlink
      ? "La biblioteca actual no contiene un NE555 ni otros temporizadores. Para no inventar componentes, solo se propone un circuito LED básico; no hará que parpadee."
      : "Se propone una batería, una resistencia limitadora y un LED conectados en serie.",
    components: components.filter((item) => supportedTypes.has(item.type)),
    wires,
    confirmedRequirements: ["El pedido menciona un LED."],
    assumptions: ["Se usa la batería de 9 V y la resistencia predeterminada de 220 Ω de la biblioteca."],
    missingInformation: asksBlink
      ? ["Agregar un componente temporizador compatible para generar el parpadeo."]
      : ["Confirmar que los valores de la batería, la resistencia y el LED son adecuados para el LED real."],
    warnings: [
      "MODO DEMOSTRACIÓN: esta propuesta usa reglas fijas, no un modelo de IA.",
      "El verificador actual comprueba estructura, no demuestra el funcionamiento eléctrico.",
      "No construyas el circuito físicamente sin revisar los valores y la polaridad.",
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
  } catch {
    return NextResponse.json(
      { error: "No se pudo interpretar la solicitud. Intentá de nuevo." },
      { status: 400 },
    );
  }
}
