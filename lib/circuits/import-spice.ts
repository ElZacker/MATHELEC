import { addComponent, connectTerminals, createCircuit } from "./circuit-model";
import type { Circuit, ComponentType } from "./types";

export type SpiceImportResult = {
  circuit: Circuit;
  warnings: string[];
  unsupportedLines: string[];
};

type ElementRecord = {
  name: string;
  type: "resistor" | "led" | "battery";
  nodeA: string;
  nodeB: string;
  value: number;
};

function parseSpiceValue(raw: string): number | null {
  const match = raw.trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(meg|[tgkmunpf])?$/i);
  if (!match) return null;
  const number = Number(match[1]);
  const suffix = (match[2] ?? "").toLowerCase();
  const multiplier: Record<string, number> = {
    "": 1, p: 1e-12, n: 1e-9, u: 1e-6, m: 1e-3,
    k: 1e3, meg: 1e6, g: 1e9, t: 1e12, f: 1e-15,
  };
  const value = number * multiplier[suffix];
  return Number.isFinite(value) ? value : null;
}

/**
 * Importador deliberadamente limitado de netlists SPICE de texto.
 * No interpreta archivos nativos de Livewire ni realiza simulación.
 */
export function importSpiceNetlist(source: string, projectName = "Circuito SPICE importado"): SpiceImportResult {
  if (source.length > 1_000_000) throw new Error("El archivo supera el límite de 1 MB de texto.");
  const records: ElementRecord[] = [];
  const warnings: string[] = [];
  const unsupportedLines: string[] = [];
  const lines = source.split(/\r?\n/);
  let sawElement = false;

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("*") || line.startsWith(";")) continue;
    if (line.startsWith("+")) {
      warnings.push(`Línea ${index + 1}: se omitió una continuación SPICE; algunos modelos pueden quedar incompletos.`);
      continue;
    }
    if (line.startsWith(".")) continue; // directives are not circuit elements
    const tokens = line.split(/\s+/);
    const name = tokens[0];
    const prefix = name[0]?.toUpperCase();
    if (!prefix) continue;

    if (prefix === "R" && tokens.length >= 4) {
      sawElement = true;
      const value = parseSpiceValue(tokens[3]);
      if (value === null || value <= 0) {
        unsupportedLines.push(`Línea ${index + 1}: resistencia con valor no compatible (${name}).`);
      } else {
        records.push({ name, type: "resistor", nodeA: tokens[1], nodeB: tokens[2], value });
      }
    } else if (prefix === "D" && tokens.length >= 4) {
      sawElement = true;
      records.push({ name, type: "led", nodeA: tokens[1], nodeB: tokens[2], value: 2 });
      warnings.push(`${name}: el diodo se representa como LED genérico; no se importan el modelo ni sus parámetros.`);
    } else if (prefix === "V" && tokens.length >= 4) {
      sawElement = true;
      const valueIndex = tokens.findIndex((token, i) => i >= 3 && /^(DC)?[+-]?(?:\d|\.\d)/i.test(token));
      const valueToken = valueIndex >= 0 ? tokens[valueIndex].replace(/^DC/i, "") : "";
      const value = parseSpiceValue(valueToken);
      if (value === null || value <= 0) {
        unsupportedLines.push(`Línea ${index + 1}: fuente ${name} no compatible; solo se importan tensiones DC positivas simples.`);
      } else {
        records.push({ name, type: "battery", nodeA: tokens[1], nodeB: tokens[2], value });
      }
    } else if (/^[QMLJXEFGHISWBC]/i.test(name)) {
      sawElement = true;
      unsupportedLines.push(`Línea ${index + 1}: elemento ${name} no admitido por el modelo actual de MATHELEC.`);
    } else {
      unsupportedLines.push(`Línea ${index + 1}: formato no reconocido: ${line.slice(0, 100)}`);
    }
  }

  if (!sawElement || records.length === 0) {
    throw new Error("No se encontraron elementos R, D o V compatibles en la netlist. El archivo no se importó.");
  }

  let circuit = createCircuit(projectName.slice(0, 80) || "Circuito SPICE importado");
  const nodes = new Map<string, { componentId: string; terminalId: string }[]>();
  const nodeKey = (node: string) => node.toLowerCase();
  const positions = records.map((_, i) => ({ x: 75 + (i % 4) * 95, y: 65 + Math.floor(i / 4) * 75 }));

  records.forEach((record, index) => {
    const type: ComponentType = record.type;
    circuit = addComponent(circuit, type, positions[index].x, positions[index].y);
    const component = circuit.components[circuit.components.length - 1];
    component.label = record.name.slice(0, 16);
    if (record.type === "resistor") component.properties.resistance = record.value;
    if (record.type === "battery") component.properties.voltage = record.value;
    const terminalA = record.type === "battery" ? "positive" : record.type === "led" ? "anode" : "a";
    const terminalB = record.type === "battery" ? "negative" : record.type === "led" ? "cathode" : "b";
    for (const [node, terminalId] of [[record.nodeA, terminalA], [record.nodeB, terminalB]] as const) {
      const key = nodeKey(node);
      const pins = nodes.get(key) ?? [];
      pins.push({ componentId: component.id, terminalId });
      nodes.set(key, pins);
    }
  });

  for (const [node, pins] of nodes) {
    if (node === "0" || node === "gnd" || node === "ground") {
      circuit = addComponent(circuit, "ground", 390, 285);
      const ground = circuit.components[circuit.components.length - 1];
      const groundPin = { componentId: ground.id, terminalId: "gnd" };
      if (pins.length) {
        circuit = connectTerminals(circuit, pins[0].componentId, pins[0].terminalId, groundPin.componentId, groundPin.terminalId);
        for (const pin of pins.slice(1)) {
          circuit = connectTerminals(circuit, pins[0].componentId, pins[0].terminalId, pin.componentId, pin.terminalId);
        }
      }
      continue;
    }
    for (let i = 1; i < pins.length; i++) {
      circuit = connectTerminals(circuit, pins[i - 1].componentId, pins[i - 1].terminalId, pins[i].componentId, pins[i].terminalId);
    }
  }

  warnings.unshift("Importación parcial de netlist SPICE: se conservan conexiones por nodos para los elementos compatibles, pero no modelos, directivas, análisis ni disposición original.");
  return { circuit, warnings, unsupportedLines };
}
