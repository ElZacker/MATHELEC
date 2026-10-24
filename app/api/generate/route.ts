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

    return NextResponse.json(buildDemoProposal(prompt));
  } catch {
    return NextResponse.json(
      { error: "No se pudo interpretar la solicitud. Intentá de nuevo." },
      { status: 400 },
    );
  }
}
