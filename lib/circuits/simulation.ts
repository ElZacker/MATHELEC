import type { Circuit, CircuitComponent } from "./types";

export type SimulationResult = {
  supported: boolean;
  title: string;
  summary: string;
  measurements: { label: string; value: string }[];
  disclaimer: string;
};

function connectedComponent(circuit: Circuit, componentId: string, terminalId: string) {
  const wire = circuit.wires.find((item) =>
    (item.from.componentId === componentId && item.from.terminalId === terminalId) ||
    (item.to.componentId === componentId && item.to.terminalId === terminalId)
  );
  if (!wire) return null;
  const from = wire.from.componentId === componentId && wire.from.terminalId === terminalId;
  return { component: circuit.components.find((item) => item.id === (from ? wire.to.componentId : wire.from.componentId)), terminalId: from ? wire.to.terminalId : wire.from.terminalId };
}
function otherTerminal(component: CircuitComponent, terminalId: string) {
  return component.terminals.find((item) => item.id !== terminalId)?.id ?? null;
}
function unsupported(summary: string): SimulationResult {
  return { supported: false, title: "No se puede simular esta topología todavía", summary, measurements: [], disclaimer: "Solo se resuelve un lazo serie DC con fuente, resistencia, LED y opcionalmente interruptor. No es SPICE y no valida seguridad ni funcionamiento físico." };
}

/** Resuelve un punto de operación aproximado para un único lazo serie DC. */
export function runDcSimulation(circuit: Circuit): SimulationResult {
  if (circuit.components.length < 3 || circuit.components.length > 4) return unsupported("Se necesita fuente DC, resistencia, LED y, opcionalmente, un interruptor. Este modelo no resuelve todavía otras topologías; no se muestran mediciones ficticias.").replace("x","x");
  if (circuit.wires.length !== circuit.components.length) return unsupported("El lazo no parece cerrado: la cantidad de cables no coincide con un único circuito serie. Revisá terminales abiertos, cables faltantes o conexiones adicionales.");
  const sources = circuit.components.filter((item) => ["battery", "cell", "voltage_source_dc"].includes(item.type));
  const resistors = circuit.components.filter((item) => item.type === "resistor");
  const leds = circuit.components.filter((item) => item.type === "led");
  const switches = circuit.components.filter((item) => ["switch", "switch_spst"].includes(item.type));
  if (sources.length !== 1 || resistors.length !== 1 || leds.length !== 1 || switches.length !== circuit.components.length - 3) return unsupported("Se admite una sola fuente DC, una resistencia, un LED y como máximo un interruptor.");
  const source = sources[0], resistor = resistors[0], led = leds[0], switchComponent = switches[0];
  const allowedTypes = new Set([source.type, resistor.type, led.type, ...(switchComponent ? [switchComponent.type] : [])]);
  if (circuit.components.some((item) => !allowedTypes.has(item.type))) return unsupported("Hay componentes sin modelo eléctrico implementado.");
  for (const component of circuit.components) {
    if (component.terminals.length !== 2) return unsupported(`${component.label} no tiene dos terminales compatibles.`);
    for (const terminal of component.terminals) {
      const matches = circuit.wires.filter((wire) => (wire.from.componentId === component.id && wire.from.terminalId === terminal.id) || (wire.to.componentId === component.id && wire.to.terminalId === terminal.id));
      if (matches.length !== 1) return unsupported(`${component.label} no está conectado en serie por ambos terminales.`);
    }
  }
  const positive = source.terminals.find((item) => ["positive", "a"].includes(item.id));
  const negative = source.terminals.find((item) => ["negative", "b"].includes(item.id));
  if (!positive || !negative) return unsupported("No se identificaron los terminales de polaridad de la fuente.");
  let currentComponent = source, currentTerminalId = positive.id;
  const visited = new Set<string>([source.id]);
  let ledForward = false, reachedNegative = false;
  for (let step = 0; step < circuit.components.length; step++) {
    const connection = connectedComponent(circuit, currentComponent.id, currentTerminalId);
    if (!connection?.component) return unsupported("Hay un terminal sin conexión.");
    if (connection.component.id === source.id) { reachedNegative = connection.terminalId === negative.id; break; }
    const next = connection.component;
    if (visited.has(next.id)) return unsupported("Las conexiones no forman un único lazo serie.");
    visited.add(next.id);
    if (next.id === led.id) {
      if (connection.terminalId !== "anode") return unsupported("La polaridad del LED está invertida respecto de la fuente.");
      ledForward = true;
    }
    const exitTerminal = otherTerminal(next, connection.terminalId);
    if (!exitTerminal) return unsupported("No se pudo determinar el terminal de salida.");
    if (next.id === led.id && exitTerminal !== "cathode") return unsupported("No se identificó correctamente el cátodo del LED.");
    currentComponent = next; currentTerminalId = exitTerminal;
  }
  if (!reachedNegative || visited.size !== circuit.components.length || !ledForward) return unsupported("No se pudo seguir un camino único del positivo al negativo. Revisá las conexiones.");
  const voltage = source.properties.voltage, resistance = resistor.properties.resistance, forwardVoltage = led.properties.forwardVoltage, maxCurrent = led.properties.maxCurrent;
  if (typeof voltage !== "number" || typeof resistance !== "number" || typeof forwardVoltage !== "number" || typeof maxCurrent !== "number" || ![voltage,resistance,forwardVoltage,maxCurrent].every(Number.isFinite) || voltage <= 0 || resistance <= 0 || forwardVoltage < 0 || maxCurrent <= 0) return unsupported("Faltan valores eléctricos válidos en la fuente, resistencia o LED.");
  const closed = switchComponent ? switchComponent.properties.closed === true : true;
  const current = closed ? Math.max(0, (voltage - forwardVoltage) / resistance) : 0;
  const ledVoltage = current > 0 ? forwardVoltage : 0, resistorVoltage = current * resistance;
  const measurements = [
    { label: "Tensión de fuente", value: `${voltage.toFixed(2)} V` },
    { label: "Corriente del lazo", value: `${(current * 1000).toFixed(2)} mA` },
    { label: "Caída en resistencia", value: `${resistorVoltage.toFixed(2)} V` },
    { label: "Caída estimada en LED", value: `${ledVoltage.toFixed(2)} V` },
    { label: "Potencia en resistencia", value: `${(current * current * resistance * 1000).toFixed(2)} mW` },
  ];
  const summary = !closed ? "El interruptor está abierto: el modelo ideal predice corriente nula."
    : current === 0 ? "La tensión disponible no supera la caída directa declarada del LED; el modelo predice corriente nula."
    : current * 1000 > maxCurrent ? `ERROR ELÉCTRICO: el modelo estima ${(current * 1000).toFixed(2)} mA, por encima del máximo declarado de ${maxCurrent} mA. Aumentá la resistencia o revisá la tensión de alimentación antes de construir.`
    : "La corriente estimada no supera el máximo declarado del LED según este modelo simplificado.";
  return { supported: true, title: "Resultado de simulación DC aproximada", summary, measurements, disclaimer: "Modelo estático ideal: LED por caída directa constante, fuente y resistencia ideales. No incluye tolerancias, temperatura, transitorios ni modelos SPICE; no reemplaza simulación profesional ni revisión humana." };
}
