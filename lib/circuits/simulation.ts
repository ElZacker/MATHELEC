import type { Circuit, CircuitComponent } from "./types";

export type SimulationResult = {
  supported: boolean;
  title: string;
  summary: string;
  measurements: { label: string; value: string }[];
  disclaimer: string;
  activeComponentIds?: string[];
  oscillation?: { periodMs: number; highMs: number; componentIds: string[] };
  sequencer?: { stepMs: number; steps: { label: string; componentIds: string[] }[] };
};

type Branch = { component: CircuitComponent; a: string; b: string; kind: "resistor" | "source" | "diode"; value: number; resistance?: number };

function unsupported(summary: string): SimulationResult {
  return { supported: false, title: "Topología no compatible con los modelos actuales", summary, measurements: [], disclaimer: "No se muestran mediciones ficticias. El simulador actual resuelve redes DC con resistencias, fuentes independientes e indicadores LED/diodos mediante modelos aproximados. No es un reemplazo completo de SPICE, Livewire o Proteus." };
}
function finiteProperty(component: CircuitComponent, key: string, fallback: number): number {
  const value = component.properties[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function solveLinear(matrix: number[][], vector: number[]): number[] | null {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    for (let j = col; j <= n; j++) a[col][j] /= divisor;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      if (!factor) continue;
      for (let j = col; j <= n; j++) a[row][j] -= factor * a[col][j];
    }
  }
  return a.map((row) => row[n]);
}


type NetTopology = {
  nodeFor: (componentId: string, terminalId: string) => string;
  connected: (componentId: string, terminalId: string) => boolean;
};
function createNetTopology(circuit: Circuit): NetTopology {
  const parent = new Map<string, string>();
  for (const component of circuit.components) for (const terminal of component.terminals) {
    const key = \`\${component.id}:\${terminal.id}\`;
    parent.set(key, key);
  }
  const find = (key: string): string => {
    const p = parent.get(key);
    if (!p) return key;
    if (p === key) return p;
    const root = find(p);
    parent.set(key, root);
    return root;
  };
  for (const wire of circuit.wires) {
    const a = \`\${wire.from.componentId}:\${wire.from.terminalId}\`;
    const b = \`\${wire.to.componentId}:\${wire.to.terminalId}\`;
    if (!parent.has(a) || !parent.has(b)) continue;
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  return {
    nodeFor: (componentId, terminalId) => find(\`\${componentId}:\${terminalId}\`),
    connected: (componentId, terminalId) => circuit.wires.some((wire) =>
      (wire.from.componentId === componentId && wire.from.terminalId === terminalId) ||
      (wire.to.componentId === componentId && wire.to.terminalId === terminalId)),
  };
}
function componentTerminalNode(topology: NetTopology, component: CircuitComponent, terminalId: string): string {
  return topology.nodeFor(component.id, terminalId);
}
function capacitorFarads(component: CircuitComponent): number {
  const value = finiteProperty(component, "capacitance", 100);
  const unit = String(component.properties.unit ?? "nF").toLowerCase();
  const scale: Record<string, number> = { f: 1, mf: 1e-3, uf: 1e-6, "µf": 1e-6, nf: 1e-9, "µnf": 1e-9, pf: 1e-12 };
  return value * (scale[unit] ?? 1e-9);
}
function branchTerminals(component: CircuitComponent) {
  const a = component.terminals.find((terminal) => terminal.id === "a") ?? component.terminals[0];
  const b = component.terminals.find((terminal) => terminal.id === "b") ?? component.terminals[1];
  return a && b ? { a, b } : null;
}
function resistorAcross(circuit: Circuit, topology: NetTopology, nodeA: string, nodeB: string): CircuitComponent | undefined {
  return circuit.components.find((component) => {
    if (component.type !== "resistor") return false;
    const terminals = branchTerminals(component);
    if (!terminals) return false;
    const a = componentTerminalNode(topology, component, terminals.a.id);
    const b = componentTerminalNode(topology, component, terminals.b.id);
    return (a === nodeA && b === nodeB) || (a === nodeB && b === nodeA);
  });
}
function ledLoadsFromNode(circuit: Circuit, topology: NetTopology, outputNode: string, returnNode: string): string[] {
  const ids: string[] = [];
  for (const led of circuit.components.filter((component) => component.type === "led")) {
    const anode = led.terminals.find((terminal) => terminal.id === "anode");
    const cathode = led.terminals.find((terminal) => terminal.id === "cathode");
    if (!anode || !cathode || componentTerminalNode(topology, led, cathode.id) !== returnNode) continue;
    const anodeNode = componentTerminalNode(topology, led, anode.id);
    const seriesResistor = circuit.components.some((component) => {
      if (component.type !== "resistor") return false;
      const terminals = branchTerminals(component);
      if (!terminals) return false;
      const a = componentTerminalNode(topology, component, terminals.a.id);
      const b = componentTerminalNode(topology, component, terminals.b.id);
      return (a === outputNode && b === anodeNode) || (b === outputNode && a === anodeNode);
    });
    if (seriesResistor) ids.push(led.id);
  }
  return ids;
}
type Astable555Params = { periodMs: number; highMs: number; lowMs: number; sourceVoltage: number; ledIds: string[] };
function getAstable555Params(circuit: Circuit): Astable555Params | null {
  const timer = circuit.components.find((component) => component.type === "ic_555");
  const source = circuit.components.find((component) => ["battery", "cell", "voltage_source_dc"].includes(component.type));
  if (!timer || !source) return null;
  const topology = createNetTopology(circuit);
  const requiredPins = ["vcc", "gnd", "reset", "trigger", "threshold", "discharge", "control", "output"];
  if (requiredPins.some((pin) => !topology.connected(timer.id, pin))) return null;
  const plus = source.terminals.find((terminal) => ["positive", "a"].includes(terminal.id));
  const minus = source.terminals.find((terminal) => ["negative", "b"].includes(terminal.id));
  if (!plus || !minus) return null;
  const vccNode = topology.nodeFor(timer.id, "vcc");
  const returnNode = topology.nodeFor(timer.id, "gnd");
  const sourcePositive = topology.nodeFor(source.id, plus.id);
  const sourceNegative = topology.nodeFor(source.id, minus.id);
  const dischargeNode = topology.nodeFor(timer.id, "discharge");
  const thresholdNode = topology.nodeFor(timer.id, "threshold");
  if (vccNode !== sourcePositive || returnNode !== sourceNegative ||
      topology.nodeFor(timer.id, "reset") !== sourcePositive ||
      topology.nodeFor(timer.id, "trigger") !== thresholdNode ||
      topology.nodeFor(timer.id, "control") !== sourceNegative) return null;
  const ra = resistorAcross(circuit, topology, sourcePositive, dischargeNode);
  const rb = resistorAcross(circuit, topology, dischargeNode, thresholdNode);
  const capacitor = circuit.components.find((component) => {
    if (component.type !== "capacitor" && component.type !== "polarized_capacitor") return false;
    const terminals = branchTerminals(component);
    if (!terminals) return false;
    const a = topology.nodeFor(component.id, terminals.a.id);
    const b = topology.nodeFor(component.id, terminals.b.id);
    return (a === thresholdNode && b === sourceNegative) || (b === thresholdNode && a === sourceNegative);
  });
  if (!ra || !rb || !capacitor) return null;
  const resistanceA = finiteProperty(ra, "resistance", 0);
  const resistanceB = finiteProperty(rb, "resistance", 0);
  const capacitance = capacitorFarads(capacitor);
  const voltage = finiteProperty(source, "voltage", 0);
  if (resistanceA <= 0 || resistanceB <= 0 || capacitance <= 0 || voltage <= 0) return null;
  const highMs = 0.693 * (resistanceA + resistanceB) * capacitance * 1000;
  const lowMs = 0.693 * resistanceB * capacitance * 1000;
  const periodMs = highMs + lowMs;
  if (![highMs, lowMs, periodMs].every(Number.isFinite) || periodMs <= 0) return null;
  const ledIds = ledLoadsFromNode(circuit, topology, topology.nodeFor(timer.id, "output"), sourceNegative);
  return { periodMs, highMs, lowMs, sourceVoltage: voltage, ledIds };
}
function simulateAstable555(circuit: Circuit): SimulationResult {
  const timer = circuit.components.find((component) => component.type === "ic_555");
  const params = getAstable555Params(circuit);
  if (!timer || !params) return unsupported("El NE555 no tiene una topología astable completa reconocible. Revisá VCC, GND, RESET, TRIG, THR, DISCH, CTRL, las dos resistencias y el capacitor.");
  return {
    supported: true, title: "Simulación temporal del NE555",
    summary: params.ledIds.length
      ? "Se reconoció un astable NE555. La salida se alterna y el LED conectado a OUT se anima según los tiempos calculados."
      : "Se reconoció un astable NE555. La onda cuadrada se calcula con un modelo funcional ideal; no se encontró un LED indicador conectado directamente a OUT.",
    measurements: [
      { label: "Frecuencia estimada", value: \`\${(1000 / params.periodMs).toFixed(2)} Hz\` },
      { label: "Período", value: \`\${params.periodMs.toFixed(1)} ms\` },
      { label: "Salida alta (Ton)", value: \`\${params.highMs.toFixed(1)} ms\` },
      { label: "Salida baja (Toff)", value: \`\${params.lowMs.toFixed(1)} ms\` },
    ],
    activeComponentIds: params.ledIds, oscillation: { periodMs: params.periodMs, highMs: params.highMs, componentIds: params.ledIds },
    disclaimer: "Modelo temporal analítico del astable ideal. No incluye saturación real del transistor interno, tolerancias, fuga del capacitor ni retardos; no sustituye una simulación de fabricante.",
  };
}
function simulate4017Sequence(circuit: Circuit): SimulationResult {
  const counter = circuit.components.find((component) => component.type === "ic_4017");
  if (!counter) return unsupported("No se encontró un CD4017.");
  const timerParams = getAstable555Params(circuit);
  if (!timerParams) return unsupported("El CD4017 necesita un reloj conectado. En esta versión se reconoce un NE555 astable conectado a CLK.");
  const topology = createNetTopology(circuit);
  const timer = circuit.components.find((component) => component.type === "ic_555")!;
  const source = circuit.components.find((component) => ["battery", "cell", "voltage_source_dc"].includes(component.type))!;
  const plus = source.terminals.find((terminal) => ["positive", "a"].includes(terminal.id))!;
  const minus = source.terminals.find((terminal) => ["negative", "b"].includes(terminal.id))!;
  const positiveNode = topology.nodeFor(source.id, plus.id);
  const returnNode = topology.nodeFor(source.id, minus.id);
  if (topology.nodeFor(counter.id, "vdd") !== positiveNode || topology.nodeFor(counter.id, "vss") !== returnNode ||
      topology.nodeFor(counter.id, "enable") !== returnNode || topology.nodeFor(counter.id, "reset") !== returnNode ||
      topology.nodeFor(counter.id, "clock") !== topology.nodeFor(timer.id, "output")) {
    return unsupported("El CD4017 tiene conexiones de alimentación, ENABLE, RESET o CLK incompatibles con el secuenciador de esta versión.");
  }
  const steps = ["q0","q1","q2","q3","q4","q5"].map((pin, index) => {
    const node = topology.nodeFor(counter.id, pin);
    const componentIds = ledLoadsFromNode(circuit, topology, node, returnNode);
    return { label: \`Q\${index}\`, componentIds };
  });
  if (!steps.some((step) => step.componentIds.length)) return unsupported("El CD4017 no tiene LED conectados a sus salidas Q0–Q5 mediante resistencias serie.");
  return {
    supported: true, title: "Simulación secuencial del CD4017",
    summary: "El contador avanza una salida por cada ciclo del reloj NE555. Las salidas Q0–Q5 se animan secuencialmente; el modelo es digital ideal.",
    measurements: [
      { label: "Reloj de entrada", value: \`\${(1000 / timerParams.periodMs).toFixed(2)} Hz\` },
      { label: "Tiempo por paso", value: \`\${timerParams.periodMs.toFixed(1)} ms\` },
      { label: "Estados simulados", value: String(steps.length) },
    ],
    activeComponentIds: steps[0].componentIds,
    sequencer: { stepMs: timerParams.periodMs, steps },
    disclaimer: "Modelo funcional digital de seis salidas. No representa retardos, consumo, todos los pines físicos del CD4017 ni los estados eléctricos analógicos.",
  };
}
function simulateCombinationalLogic(circuit: Circuit): SimulationResult {
  const gateTypes = new Set(["logic_gate_and","logic_gate_or","logic_gate_not","logic_gate_nand","logic_gate_nor","logic_gate_xor","logic_gate_xnor","logic_gate_buffer"]);
  const gates = circuit.components.filter((component) => gateTypes.has(component.type));
  if (!gates.length) return unsupported("No se encontraron puertas lógicas compatibles.");
  const allowed = new Set([...gateTypes,"battery","cell","voltage_source_dc","resistor","led","ground","ground_earth"]);
  const unsupportedTypes = circuit.components.filter((component) => !allowed.has(component.type));
  if (unsupportedTypes.length) return unsupported("La prueba lógica contiene elementos sin modelo digital en este análisis: " + unsupportedTypes.map((component) => component.label).join(", ") + ".");
  const topology = createNetTopology(circuit);
  const source = circuit.components.find((component) => ["battery","cell","voltage_source_dc"].includes(component.type));
  if (!source) return unsupported("La lógica necesita una fuente de referencia. Conectá una fuente DC, VCC y GND.");
  const plus = source.terminals.find((terminal) => ["positive","a"].includes(terminal.id));
  const minus = source.terminals.find((terminal) => ["negative","b"].includes(terminal.id));
  if (!plus || !minus) return unsupported("No se reconocen los terminales de alimentación digital.");
  const highNode = topology.nodeFor(source.id, plus.id), lowNode = topology.nodeFor(source.id, minus.id);
  const values = new Map<string, boolean>();
  const outputPins = gates.map((gate) => ({ gate, node: topology.nodeFor(gate.id, "y") }));
  const inputValue = (node: string): boolean | null => {
    if (node === highNode) return true;
    if (node === lowNode) return false;
    const driven = outputPins.find((pin) => pin.node === node);
    return driven ? values.get(driven.gate.id) ?? null : null;
  };
  for (let pass = 0; pass <= gates.length; pass++) {
    let changed = false;
    for (const gate of gates) {
      const inputPins = gate.type === "logic_gate_not" || gate.type === "logic_gate_buffer" ? ["a"] : ["a","b"];
      const inputStates = inputPins.map((pin) => inputValue(topology.nodeFor(gate.id, pin)));
      if (inputStates.some((value) => value === null)) continue;
      const a = inputStates[0] === true, b = inputStates[1] === true;
      let out: boolean;
      switch (gate.type) {
        case "logic_gate_and": out = a && b; break;
        case "logic_gate_or": out = a || b; break;
        case "logic_gate_not": out = !a; break;
        case "logic_gate_nand": out = !(a && b); break;
        case "logic_gate_nor": out = !(a || b); break;
        case "logic_gate_xor": out = a !== b; break;
        case "logic_gate_xnor": out = a === b; break;
        default: out = a;
      }
      if (values.get(gate.id) !== out) { values.set(gate.id, out); changed = true; }
    }
    if (!changed) break;
  }
  const unresolved = gates.filter((gate) => !values.has(gate.id));
  if (unresolved.length) return unsupported("No pude resolver las entradas digitales de: " + unresolved.map((gate) => gate.label).join(", ") + ". Cada entrada debe estar conectada a VCC/GND o a la salida de otra puerta compatible.");
  const activeComponentIds: string[] = [];
  const measurements: SimulationResult["measurements"] = [];
  for (const gate of gates) {
    const state = values.get(gate.id) === true;
    measurements.push({ label: \`\${gate.label} (\${gate.type})\`, value: state ? "Salida HIGH (1)" : "Salida LOW (0)" });
    if (state) activeComponentIds.push(...ledLoadsFromNode(circuit, topology, topology.nodeFor(gate.id,"y"), lowNode));
  }
  return {
    supported: true, title: "Simulación de lógica digital",
    summary: "Se calcularon los estados lógicos estables de las puertas conectadas a niveles HIGH/LOW explícitos. Los LED de salida se activan visualmente cuando la salida es HIGH.",
    measurements, activeComponentIds: [...new Set(activeComponentIds)],
    disclaimer: "Simulación funcional booleana con niveles lógicos ideales; no calcula tensiones analógicas, retardos, corrientes, metastabilidad ni puertas integradas de muchos pines.",
  };
}

/**
 * DC operating-point solver using modified nodal analysis. Handles multiple
 * loops/parallel branches for supported two-terminal DC models. Diodes use an
 * iterative piecewise-linear approximation, not a manufacturer SPICE model.
 */
export function runDcSimulation(circuit: Circuit): SimulationResult {
  if (!circuit.components.length) return unsupported("Agregá componentes antes de iniciar la simulación.");
  if (circuit.components.some((component) => component.type === "ic_4017")) return simulate4017Sequence(circuit);
  if (circuit.components.some((component) => component.type === "ic_555")) return simulateAstable555(circuit);
  if (circuit.components.some((component) => component.type.startsWith("logic_gate_"))) return simulateCombinationalLogic(circuit);
  const allowed = new Set(["battery", "cell", "voltage_source_dc", "resistor", "led", "diode", "switch", "switch_spst", "fuse", "lamp", "motor", "ldr", "thermistor", "ground", "ground_earth"]);
  const unsupportedComponents = circuit.components.filter((c) => !allowed.has(c.type));
  if (unsupportedComponents.length) return unsupported("Todavía faltan modelos eléctricos para: " + unsupportedComponents.map((c) => `${c.label} (${c.type})`).join(", ") + ". La biblioteca visual es más amplia que los modelos de simulación; no se puede afirmar que esos componentes funcionen físicamente todavía.");
  if (circuit.components.some((c) => !((c.type === "ground" || c.type === "ground_earth") && c.terminals.length === 1) && c.terminals.length !== 2)) return unsupported("Esta versión resuelve componentes de dos terminales y símbolos de tierra de un terminal. Los integrados, transistores y otros componentes multipin requieren modelos específicos que aún no están implementados.");
  const terminalKeys = new Map<string, string>();
  for (const c of circuit.components) for (const t of c.terminals) terminalKeys.set(`${c.id}:${t.id}`, `${c.id}:${t.id}`);
  const parent = new Map([...terminalKeys.values()].map((key) => [key, key]));
  const find = (key: string): string => {
    const p = parent.get(key);
    if (!p) return key;
    if (p === key) return key;
    const root = find(p); parent.set(key, root); return root;
  };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const terminalExists = (componentId: string, terminalId: string) => terminalKeys.has(`${componentId}:${terminalId}`);
  for (const wire of circuit.wires) {
    const a = `${wire.from.componentId}:${wire.from.terminalId}`, b = `${wire.to.componentId}:${wire.to.terminalId}`;
    if (!terminalExists(wire.from.componentId, wire.from.terminalId) || !terminalExists(wire.to.componentId, wire.to.terminalId)) return unsupported(`El cable ${wire.id} apunta a un terminal inexistente.`);
    union(a, b);
  }
  const nodeOf = (c: CircuitComponent, terminalId: string) => find(`${c.id}:${terminalId}`);
  const sources = circuit.components.filter((c) => ["battery", "cell", "voltage_source_dc"].includes(c.type));
  if (!sources.length) return unsupported("No se encontró una fuente DC independiente. Agregá una batería o fuente DC para calcular el punto de operación.");
  for (const c of circuit.components) {
    if (c.terminals.some((t) => !circuit.wires.some((w) => (w.from.componentId === c.id && w.from.terminalId === t.id) || (w.to.componentId === c.id && w.to.terminalId === t.id)))) return unsupported(`${c.label} tiene un terminal sin cable. Completá las conexiones antes de simular.`);
  }
  const ground = sources[0].terminals.find((t) => ["negative", "b"].includes(t.id));
  if (!ground) return unsupported(`No se reconoce el terminal negativo de ${sources[0].label}.`);
  const groundNode = nodeOf(sources[0], ground.id);
  for (const g of circuit.components.filter((c) => c.type === "ground" || c.type === "ground_earth")) {
    if (g.terminals[0]) union(nodeOf(g, g.terminals[0].id), groundNode);
  }
  const allNodes = [...new Set(circuit.components.flatMap((c) => c.terminals.map((t) => nodeOf(c, t.id))))].filter((n) => n !== groundNode);
  const nodeIndex = new Map(allNodes.map((n, i) => [n, i]));
  const voltageSources = circuit.components.filter((c) => ["battery", "cell", "voltage_source_dc"].includes(c.type));
  const sourceIndex = new Map(voltageSources.map((c, i) => [c.id, allNodes.length + i]));
  const diodeOn = new Map(circuit.components.filter((c) => ["led", "diode"].includes(c.type)).map((c) => [c.id, false]));
  let solution: number[] | null = null;
  let branches: Branch[] = [];
  const branchNodes = (c: CircuitComponent) => ({ a: nodeOf(c, c.terminals[0].id), b: nodeOf(c, c.terminals[1].id) });
  for (let iteration = 0; iteration < 12; iteration++) {
    branches = [];
    for (const c of circuit.components) {
      if (c.type === "ground" || c.type === "ground_earth") continue;
      const { a, b } = branchNodes(c);
      if (["battery", "cell", "voltage_source_dc"].includes(c.type)) {
        const plus = c.terminals.find((t) => ["positive", "a"].includes(t.id));
        const minus = c.terminals.find((t) => ["negative", "b"].includes(t.id));
        if (!plus || !minus) return unsupported(`${c.label}: no se reconoce la polaridad de la fuente.`);
        branches.push({ component: c, a: nodeOf(c, plus.id), b: nodeOf(c, minus.id), kind: "source", value: finiteProperty(c, "voltage", 0) });
      } else if (["led", "diode"].includes(c.type)) {
        const anode = c.terminals.find((t) => t.id === "anode") ?? c.terminals[0];
        const cathode = c.terminals.find((t) => t.id === "cathode") ?? c.terminals[1];
        branches.push({ component: c, a: nodeOf(c, anode.id), b: nodeOf(c, cathode.id), kind: "diode", value: finiteProperty(c, "forwardVoltage", c.type === "led" ? 2 : 0.7), resistance: diodeOn.get(c.id) ? 1 : Infinity });
      } else {
        const { a, b } = branchNodes(c);
        let resistance = finiteProperty(c, "resistance", c.type === "motor" || c.type === "lamp" ? 20 : c.type === "fuse" ? 0.05 : 10000);
        
        if (["switch", "switch_spst"].includes(c.type) || c.type === "fuse") {
          const closed = c.type === "fuse" || c.properties.closed === true;
          resistance = closed ? (c.type === "fuse" ? 0.05 : 1e-3) : 1e12;
        }
        if (["resistor", "motor", "lamp", "ldr", "thermistor"].includes(c.type) && resistance <= 0) return unsupported(`${c.label}: resistencia inválida.`);
        branches.push({ component: c, a, b, kind: "resistor", value: resistance });
      }
    }
    const n = allNodes.length + voltageSources.length;
    if (n === 0) return unsupported("No hay nodos eléctricos suficientes para resolver el circuito.");
    const matrix = Array.from({ length: n }, () => Array(n).fill(0) as number[]);
    const rhs = Array(n).fill(0) as number[];
    const stampConductance = (a: string, b: string, g: number) => {
      const ia = nodeIndex.get(a), ib = nodeIndex.get(b);
      if (ia !== undefined) matrix[ia][ia] += g;
      if (ib !== undefined) matrix[ib][ib] += g;
      if (ia !== undefined && ib !== undefined) { matrix[ia][ib] -= g; matrix[ib][ia] -= g; }
    };
    for (const branch of branches) {
      if (branch.kind === "resistor" || (branch.kind === "diode" && branch.resistance !== Infinity)) {
        const resistance = branch.kind === "diode" ? (branch.resistance ?? 1) : branch.value;
        if (branch.kind === "diode") {
          // Conductance plus an equivalent offset current models the forward drop.
          const g = 1 / resistance; stampConductance(branch.a, branch.b, g);
          const ia = nodeIndex.get(branch.a), ib = nodeIndex.get(branch.b);
          const offset = branch.value * g;
          if (ia !== undefined) rhs[ia] -= offset;
          if (ib !== undefined) rhs[ib] += offset;
        } else {
          if (!Number.isFinite(resistance) || resistance <= 0) return unsupported(`${branch.component.label}: resistencia fuera de rango.`);
          stampConductance(branch.a, branch.b, 1 / resistance);
        }
      } else if (branch.kind === "source") {
        const k = sourceIndex.get(branch.component.id)!;
        const ia = nodeIndex.get(branch.a), ib = nodeIndex.get(branch.b);
        if (ia !== undefined) { matrix[ia][k] += 1; matrix[k][ia] += 1; }
        if (ib !== undefined) { matrix[ib][k] -= 1; matrix[k][ib] -= 1; }
        rhs[k] = branch.value;
      }
    }
    solution = solveLinear(matrix, rhs);
    if (!solution) return unsupported("La red es singular: puede haber una fuente ideal en cortocircuito, nodos flotantes o una ruta sin referencia. Revisá las conexiones y las fuentes.");
    let changed = false;
    for (const branch of branches.filter((b) => b.kind === "diode")) {
      const va = nodeIndex.has(branch.a) ? solution[nodeIndex.get(branch.a)!] : 0;
      const vb = nodeIndex.has(branch.b) ? solution[nodeIndex.get(branch.b)!] : 0;
      const on = va - vb > branch.value;
      if (diodeOn.get(branch.component.id) !== on) { diodeOn.set(branch.component.id, on); changed = true; }
    }
    if (!changed) break;
  }
  if (!solution) return unsupported("No se encontró una solución numérica estable.");
  const nodeVoltage = (node: string) => node === groundNode ? 0 : solution![nodeIndex.get(node)!] ?? 0;
  const measurements: SimulationResult["measurements"] = [];
  const activeComponentIds: string[] = [];
  for (const branch of branches) {
    const voltage = nodeVoltage(branch.a) - nodeVoltage(branch.b);
    let current = 0;
    if (branch.kind === "source") current = solution[sourceIndex.get(branch.component.id)!] ?? 0;
    else if (branch.kind === "resistor") current = voltage / branch.value;
    else if (diodeOn.get(branch.component.id)) current = (voltage - branch.value) / (branch.resistance ?? 1);
    if (["led", "diode"].includes(branch.component.type) && current > 0.001) activeComponentIds.push(branch.component.id);
    measurements.push({ label: `${branch.component.label}: V / I`, value: `${voltage.toFixed(3)} V · ${(current * 1000).toFixed(3)} mA` });
    if (branch.component.type === "led" && current * 1000 > finiteProperty(branch.component, "maxCurrent", 20)) {
      measurements.push({ label: `Advertencia ${branch.component.label}`, value: `Sobrecorriente: ${(current * 1000).toFixed(2)} mA` });
    }
  }
  return {
    supported: true,
    title: "Punto de operación DC calculado",
    summary: activeComponentIds.length ? "Se detectó corriente directa en: " + activeComponentIds.map((id) => circuit.components.find((c) => c.id === id)?.label ?? id).join(", ") + ". Los símbolos LED/diodo pueden mostrarse encendidos. Revisá las advertencias de corriente máxima." : "Se resolvió el punto de operación. Ningún LED/diodo supera el umbral de corriente de encendido en este modelo.",
    measurements,
    activeComponentIds,
    disclaimer: "Análisis DC de red mediante MNA con modelos ideales/resistivos y diodos lineales por tramos. No simula transitorios, frecuencia, temperatura, saturación de transistores ni integrados; motores/lámparas y componentes sensibles usan equivalentes simplificados. No reemplaza Livewire, Proteus ni SPICE validado.",
  };
}
