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
  transient?: {
    kind: "ac" | "rc" | "rl" | "motor" | "network";
    frequencyHz?: number;
    timeConstantMs?: number;
    sourceVoltage: number;
    resistance: number;
    initialCurrentA: number;
    finalCurrentA: number;
    capacitanceFarads?: number;
    inductanceHenries?: number;
    mechanicalTimeConstantMs?: number;
    componentIds: string[];
    ledIds: string[];
  };
};

type ControlledSwitch = { controlPositive: string; controlNegative: string; threshold: number; onResistance: number; offResistance: number };
type Branch = { component: CircuitComponent; a: string; b: string; kind: "resistor" | "source" | "current" | "diode" | "controlled"; value: number; resistance?: number; control?: ControlledSwitch; measurementLabel?: string };

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
    const key = `${component.id}:${terminal.id}`;
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
    const a = `${wire.from.componentId}:${wire.from.terminalId}`;
    const b = `${wire.to.componentId}:${wire.to.terminalId}`;
    if (!parent.has(a) || !parent.has(b)) continue;
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  return {
    nodeFor: (componentId, terminalId) => find(`${componentId}:${terminalId}`),
    connected: (componentId, terminalId) => circuit.wires.some((wire) =>
      (wire.from.componentId === componentId && wire.from.terminalId === terminalId) ||
      (wire.to.componentId === componentId && wire.to.terminalId === terminalId)),
  };
}
function componentTerminalNode(topology: NetTopology, component: CircuitComponent, terminalId: string): string {
  return topology.nodeFor(component.id, terminalId);
}
function seriesLoopConnected(circuit: Circuit): boolean {
  if (!circuit.components.length || circuit.wires.length !== circuit.components.length) return false;
  if (circuit.components.some((component) => component.terminals.length !== 2)) return false;
  for (const component of circuit.components) for (const terminal of component.terminals) {
    const count = circuit.wires.filter((wire) =>
      (wire.from.componentId === component.id && wire.from.terminalId === terminal.id) ||
      (wire.to.componentId === component.id && wire.to.terminalId === terminal.id)).length;
    if (count !== 1) return false;
  }
  const seen = new Set<string>();
  const queue = [circuit.components[0].id];
  while (queue.length) {
    const current = queue.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const wire of circuit.wires) {
      if (wire.from.componentId === current && !seen.has(wire.to.componentId)) queue.push(wire.to.componentId);
      if (wire.to.componentId === current && !seen.has(wire.from.componentId)) queue.push(wire.from.componentId);
    }
  }
  return seen.size === circuit.components.length;
}
function firstOrderTransient(circuit: Circuit): SimulationResult | null {
  const dcSources = circuit.components.filter((component) => ["battery", "cell", "voltage_source_dc"].includes(component.type));
  if (dcSources.length !== 1 || !seriesLoopConnected(circuit)) return null;
  const componentTypes = new Set(circuit.components.map((component) => component.type));
  const allowed = new Set(["battery","cell","voltage_source_dc","resistor","capacitor","polarized_capacitor","inductor","led","diode","switch","switch_spst","fuse","motor","lamp"]);
  if ([...componentTypes].some((type) => !allowed.has(type))) return null;
  if (circuit.components.some((component) => ["switch","switch_spst"].includes(component.type) && component.properties.closed !== true)) {
    return unsupported("El circuito tiene un interruptor abierto; cerralo para observar el transitorio de carga o arranque.");
  }
  const source = dcSources[0];
  const voltage = finiteProperty(source,"voltage",0);
  if (voltage <= 0) return unsupported("La fuente DC necesita una tensión positiva.");
  const capacitors = circuit.components.filter((component) => ["capacitor","polarized_capacitor"].includes(component.type));
  const inductors = circuit.components.filter((component) => component.type === "inductor");
  const motors = circuit.components.filter((component) => component.type === "motor");
  if (capacitors.length + inductors.length + motors.length !== 1) return null;
  const resistors = circuit.components.filter((component) => component.type === "resistor");
  let totalResistance = resistors.reduce((sum,component) => sum + finiteProperty(component,"resistance",0),0);
  totalResistance += circuit.components.filter((component) => component.type === "fuse").length * 0.05;
  totalResistance += circuit.components.filter((component) => component.type === "lamp").reduce((sum,component) => sum + finiteProperty(component,"resistance",20),0);
  totalResistance += motors.reduce((sum,component) => sum + finiteProperty(component,"resistance",12),0);
  if (totalResistance <= 0) return unsupported("El transitorio necesita una resistencia en serie o una carga con resistencia positiva; no se simula una fuente ideal cortocircuitada.");
  const diodeDrop = circuit.components.filter((component) => ["led","diode"].includes(component.type)).reduce((sum,component) => sum + finiteProperty(component,"forwardVoltage",component.type === "led" ? 2 : 0.7),0);
  const effectiveVoltage = Math.max(0,voltage-diodeDrop);
  const ledIds = circuit.components.filter((component) => component.type === "led").map((component) => component.id);
  if (capacitors.length === 1) {
    const capacitor = capacitors[0];
    const capacitance = capacitorFarads(capacitor);
    const tau = totalResistance * capacitance;
    if (capacitance <= 0 || !Number.isFinite(tau) || tau <= 0) return unsupported("La capacitancia o constante de tiempo RC no es válida.");
    const initialCurrent = effectiveVoltage / totalResistance;
    return {
      supported:true,title:"Simulación transitoria RC",
      summary:"Se calculó la carga de un capacitor en una red serie RC. La corriente comienza en su valor inicial y decae exponencialmente; el LED en serie se apaga al caer la corriente por debajo del umbral didáctico.",
      measurements:[
        {label:"Constante de tiempo τ",value:(tau*1000).toFixed(2)+" ms"},
        {label:"Corriente inicial",value:(initialCurrent*1000).toFixed(3)+" mA"},
        {label:"Tensión final del capacitor",value:effectiveVoltage.toFixed(3)+" V"},
        {label:"Capacitancia",value:(capacitance*1e6).toFixed(3)+" µF"},
      ],
      activeComponentIds:initialCurrent>0.001?ledIds:[],
      transient:{kind:"rc",timeConstantMs:tau*1000,sourceVoltage:effectiveVoltage,resistance:totalResistance,initialCurrentA:initialCurrent,finalCurrentA:0,capacitanceFarads:capacitance,componentIds:[capacitor.id],ledIds},
      disclaimer:"Modelo analítico de primer orden RC, carga inicial nula y componentes ideales. No calcula fugas, ESR, saturación del LED ni condiciones iniciales arbitrarias.",
    };
  }
  const reactive = inductors[0];
  const motorUnit = String(motors[0]?.properties.inductanceUnit ?? "mH").toLowerCase();
  const motorScale = motorUnit === "h" ? 1 : motorUnit === "uh" || motorUnit === "µh" ? 1e-6 : motorUnit === "mh" ? 1e-3 : 1;
  const inductance = reactive
    ? finiteProperty(reactive,"inductance",10) * (String(reactive.properties.unit ?? "mH").toLowerCase()==="h" ? 1 : String(reactive.properties.unit ?? "mH").toLowerCase()==="uh" || String(reactive.properties.unit ?? "mH").toLowerCase()==="µh" ? 1e-6 : String(reactive.properties.unit ?? "mH").toLowerCase()==="mh" ? 1e-3 : 1)
    : finiteProperty(motors[0],"inductance",20) * motorScale;
  const tau = inductance / totalResistance;
  if (inductance <= 0 || !Number.isFinite(tau) || tau <= 0) return unsupported("La inductancia o constante de tiempo RL no es válida.");
  const finalCurrent = effectiveVoltage / totalResistance;
  const motor = motors[0];
  return {
    supported:true,title:motor?"Arranque transitorio de motor DC (modelo RL)":"Simulación transitoria RL",
    summary:motor?"El modelo RL aproxima la corriente de arranque y el establecimiento gradual del motor. No simula el par electromagnético ni la carga mecánica real.":"Se calculó el crecimiento de corriente en una red serie RL; la corriente aumenta desde cero hacia su valor estacionario.",
    measurements:[
      {label:"Constante de tiempo τ",value:(tau*1000).toFixed(2)+" ms"},
      {label:"Corriente final estimada",value:(finalCurrent*1000).toFixed(3)+" mA"},
      {label:"Inductancia usada",value:(inductance*1000).toFixed(3)+" mH"},
      ...(motor?[{label:"Velocidad mecánica",value:"Modelo de primer orden didáctico"}]:[]),
    ],
    activeComponentIds:[],
    transient:{kind:motor?"motor":"rl",timeConstantMs:tau*1000,sourceVoltage:effectiveVoltage,resistance:totalResistance,initialCurrentA:0,finalCurrentA:finalCurrent,inductanceHenries:inductance,mechanicalTimeConstantMs:motor?finiteProperty(motor,"mechanicalTimeConstantMs",250):undefined,componentIds:motor?[motor.id]:[reactive.id],ledIds},
    disclaimer:"Modelo analítico RL/motor de primer orden. El motor se reduce a resistencia e inductancia con una constante mecánica aproximada; no calcula fuerza contraelectromotriz dependiente de velocidad, par, carga, rozamiento ni conmutación real.",
  };
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
      { label: "Frecuencia estimada", value: `${(1000 / params.periodMs).toFixed(2)} Hz` },
      { label: "Período", value: `${params.periodMs.toFixed(1)} ms` },
      { label: "Salida alta (Ton)", value: `${params.highMs.toFixed(1)} ms` },
      { label: "Salida baja (Toff)", value: `${params.lowMs.toFixed(1)} ms` },
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
    return { label: `Q${index}`, componentIds };
  });
  if (!steps.some((step) => step.componentIds.length)) return unsupported("El CD4017 no tiene LED conectados a sus salidas Q0–Q5 mediante resistencias serie.");
  return {
    supported: true, title: "Simulación secuencial del CD4017",
    summary: "El contador avanza una salida por cada ciclo del reloj NE555. Las salidas Q0–Q5 se animan secuencialmente; el modelo es digital ideal.",
    measurements: [
      { label: "Reloj de entrada", value: `${(1000 / timerParams.periodMs).toFixed(2)} Hz` },
      { label: "Tiempo por paso", value: `${timerParams.periodMs.toFixed(1)} ms` },
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
    measurements.push({ label: `${gate.label} (${gate.type})`, value: state ? "Salida HIGH (1)" : "Salida LOW (0)" });
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
export function runDcSimulation(circuit: Circuit, timeSeconds = 0): SimulationResult {
  if (!circuit.components.length) return unsupported("Agregá componentes antes de iniciar la simulación.");
  if (circuit.components.some((component) => component.type === "ic_4017")) return simulate4017Sequence(circuit);
  if (circuit.components.some((component) => component.type === "ic_555")) return simulateAstable555(circuit);
  if (circuit.components.some((component) => component.type.startsWith("logic_gate_"))) return simulateCombinationalLogic(circuit);
  const transientResult = firstOrderTransient(circuit);
  if (transientResult) return transientResult;
  const allowed = new Set(["battery", "cell", "voltage_source_dc", "voltage_source_ac", "resistor", "led", "diode", "switch", "switch_spst", "fuse", "lamp", "motor", "ldr", "thermistor", "ground", "ground_earth", "npn_transistor", "pnp_transistor", "mosfet_n", "mosfet_p", "current_source", "potentiometer", "photodiode"]);
  const unsupportedComponents = circuit.components.filter((c) => !allowed.has(c.type));
  if (unsupportedComponents.length) return unsupported("Todavía faltan modelos eléctricos para: " + unsupportedComponents.map((c) => `${c.label} (${c.type})`).join(", ") + ". La biblioteca visual es más amplia que los modelos de simulación; no se puede afirmar que esos componentes funcionen físicamente todavía.");
  if (circuit.components.some((c) => {
    if ((c.type === "ground" || c.type === "ground_earth") && c.terminals.length === 1) return false;
    if (["npn_transistor", "pnp_transistor", "mosfet_n", "mosfet_p"].includes(c.type) && c.terminals.length === 3) return false;
    if (c.type === "potentiometer" && c.terminals.length === 3) return false;
    return c.terminals.length !== 2;
  })) return unsupported("Este análisis admite componentes de dos terminales, tierra y transistores/MOSFET usados como interruptores controlados. Los integrados multipin requieren modelos específicos.");
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
  const sources = circuit.components.filter((c) => ["battery", "cell", "voltage_source_dc", "voltage_source_ac", "current_source"].includes(c.type));
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
  const voltageSources = circuit.components.filter((c) => ["battery", "cell", "voltage_source_dc", "voltage_source_ac"].includes(c.type));
  const sourceIndex = new Map(voltageSources.map((c, i) => [c.id, allNodes.length + i]));
  // Arrancar con los diodos en conducción evita una matriz singular en redes
  // serie: la primera solución permite decidir si están polarizados en directa.
  const diodeOn = new Map(circuit.components.filter((c) => ["led", "diode", "photodiode"].includes(c.type)).map((c) => [c.id, true]));
  const controlledOn = new Map(circuit.components.filter((c) => ["npn_transistor", "pnp_transistor", "mosfet_n", "mosfet_p"].includes(c.type)).map((c) => [c.id, false]));
  let solution: number[] | null = null;
  let branches: Branch[] = [];
  const branchNodes = (c: CircuitComponent) => ({ a: nodeOf(c, c.terminals[0].id), b: nodeOf(c, c.terminals[1].id) });
  for (let iteration = 0; iteration < 12; iteration++) {
    branches = [];
    for (const c of circuit.components) {
      if (c.type === "ground" || c.type === "ground_earth") continue;
      const { a, b } = branchNodes(c);
      if (["battery", "cell", "voltage_source_dc", "voltage_source_ac"].includes(c.type)) {
        const plus = c.terminals.find((t) => ["positive", "a"].includes(t.id));
        const minus = c.terminals.find((t) => ["negative", "b"].includes(t.id));
        if (!plus || !minus) return unsupported(`${c.label}: no se reconoce la polaridad de la fuente.`);
        const nominalVoltage = finiteProperty(c, "voltage", 0);
        const sourceVoltage = c.type === "voltage_source_ac"
          ? nominalVoltage * (String(c.properties.unit ?? "").toLowerCase().includes("rms") ? Math.SQRT2 : 1) *
            Math.sin(2 * Math.PI * Math.max(0,finiteProperty(c,"frequency",50)) * timeSeconds)
          : nominalVoltage;
        branches.push({ component: c, a: nodeOf(c, plus.id), b: nodeOf(c, minus.id), kind: "source", value: sourceVoltage });
      } else if (["led", "diode", "photodiode"].includes(c.type)) {
        const anode = c.terminals.find((t) => t.id === "anode") ?? c.terminals[0];
        const cathode = c.terminals.find((t) => t.id === "cathode") ?? c.terminals[1];
        branches.push({ component: c, a: nodeOf(c, anode.id), b: nodeOf(c, cathode.id), kind: "diode", value: finiteProperty(c, "forwardVoltage", c.type === "led" ? 2 : c.type === "photodiode" ? 0.65 : 0.7), resistance: diodeOn.get(c.id) ? 1 : 1e9 });
      } else if (["npn_transistor", "pnp_transistor", "mosfet_n", "mosfet_p"].includes(c.type)) {
        const terminal = (id: string) => c.terminals.find((t) => t.id === id);
        const base = terminal("base"), collector = terminal("collector"), emitter = terminal("emitter");
        const gate = terminal("gate"), drain = terminal("drain"), source = terminal("source");
        let controlPositive: string, controlNegative: string, a: string, b: string, threshold: number;
        if (c.type === "npn_transistor" && base && collector && emitter) {
          controlPositive = nodeOf(c, base.id); controlNegative = nodeOf(c, emitter.id);
          a = nodeOf(c, collector.id); b = nodeOf(c, emitter.id); threshold = finiteProperty(c, "vbeOn", 0.65);
        } else if (c.type === "pnp_transistor" && base && collector && emitter) {
          controlPositive = nodeOf(c, emitter.id); controlNegative = nodeOf(c, base.id);
          a = nodeOf(c, emitter.id); b = nodeOf(c, collector.id); threshold = finiteProperty(c, "vbeOn", 0.65);
        } else if (c.type === "mosfet_n" && gate && drain && source) {
          controlPositive = nodeOf(c, gate.id); controlNegative = nodeOf(c, source.id);
          a = nodeOf(c, drain.id); b = nodeOf(c, source.id); threshold = finiteProperty(c, "gateThreshold", 2);
        } else if (c.type === "mosfet_p" && gate && drain && source) {
          controlPositive = nodeOf(c, source.id); controlNegative = nodeOf(c, gate.id);
          a = nodeOf(c, source.id); b = nodeOf(c, drain.id); threshold = Math.abs(finiteProperty(c, "gateThreshold", -2));
        } else return unsupported(`${c.label}: no se reconocieron los terminales de control/carga.`);
        const isOn = controlledOn.get(c.id) === true;
        const control: ControlledSwitch = { controlPositive, controlNegative, threshold, onResistance: finiteProperty(c, "onResistance", 25), offResistance: 1e9 };
        branches.push({ component: c, a, b, kind: "controlled", value: isOn ? control.onResistance : control.offResistance, control });
      } else if (c.type === "current_source") {
        const terminals = branchNodes(c);
        const current = finiteProperty(c, "current", 0);
        if (!Number.isFinite(current)) return unsupported(c.label + ": corriente de fuente inválida.");
        branches.push({ component: c, a: terminals.a, b: terminals.b, kind: "current", value: current });
      } else if (c.type === "potentiometer") {
        const endA = c.terminals.find((terminal) => terminal.id === "a");
        const wiper = c.terminals.find((terminal) => terminal.id === "wiper");
        const endB = c.terminals.find((terminal) => terminal.id === "b");
        if (!endA || !wiper || !endB) return unsupported(c.label + ": faltan terminales A, cursor o B del potenciómetro.");
        const total = finiteProperty(c, "resistance", 10000);
        const rawPosition = finiteProperty(c, "position", 0.5);
        const position = Math.max(0, Math.min(1, rawPosition > 1 ? rawPosition / 100 : rawPosition));
        if (total <= 0) return unsupported(c.label + ": resistencia total inválida.");
        const segmentA = Math.max(1e-3, total * position);
        const segmentB = Math.max(1e-3, total * (1-position));
        branches.push({ component: c, a: nodeOf(c,endA.id), b: nodeOf(c,wiper.id), kind:"resistor", value: segmentA, measurementLabel: c.label + " A-cursor" });
        branches.push({ component: c, a: nodeOf(c,wiper.id), b: nodeOf(c,endB.id), kind:"resistor", value: segmentB, measurementLabel: c.label + " cursor-B" });
      } else {
        const { a, b } = branchNodes(c);
        let resistance = finiteProperty(c, "resistance", c.type === "motor" ? 12 : c.type === "lamp" ? 20 : c.type === "fuse" ? 0.05 : c.type === "photodiode" ? 1e9 : 10000);
        if (["switch", "switch_spst"].includes(c.type) || c.type === "fuse") {
          const closed = c.type === "fuse" || c.properties.closed === true;
          resistance = closed ? (c.type === "fuse" ? 0.05 : 1e-3) : 1e12;
        }
        if (["resistor", "motor", "lamp", "ldr", "thermistor"].includes(c.type) && resistance <= 0) return unsupported(c.label + ": resistencia inválida.");
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
      if (branch.kind === "resistor" || branch.kind === "controlled" || branch.kind === "diode") {
        const resistance = branch.kind === "diode" ? (branch.resistance ?? 1) : branch.value;
        if (branch.kind === "diode") {
          // Conductance plus an equivalent offset current models the forward drop.
          const g = 1 / resistance; stampConductance(branch.a, branch.b, g);
          const ia = nodeIndex.get(branch.a), ib = nodeIndex.get(branch.b);
          const offset = branch.value * g;
          if (ia !== undefined) rhs[ia] += offset;
          if (ib !== undefined) rhs[ib] -= offset;
        } else {
          if (!Number.isFinite(resistance) || resistance <= 0) return unsupported(`${branch.component.label}: resistencia fuera de rango.`);
          stampConductance(branch.a, branch.b, 1 / resistance);
        }
      } else if (branch.kind === "current") {
        const ia = nodeIndex.get(branch.a), ib = nodeIndex.get(branch.b);
        if (ia !== undefined) rhs[ia] -= branch.value;
        if (ib !== undefined) rhs[ib] += branch.value;
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
    for (const branch of branches.filter((item) => item.kind === "controlled" && item.control)) {
      const control = branch.control!;
      const positive = nodeIndex.has(control.controlPositive) ? solution[nodeIndex.get(control.controlPositive)!] : 0;
      const negative = nodeIndex.has(control.controlNegative) ? solution[nodeIndex.get(control.controlNegative)!] : 0;
      const on = positive - negative >= control.threshold;
      if (controlledOn.get(branch.component.id) !== on) { controlledOn.set(branch.component.id, on); changed = true; }
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
    else if (branch.kind === "current") current = branch.value;
    else if (branch.kind === "resistor" || branch.kind === "controlled") current = voltage / branch.value;
    else if (diodeOn.get(branch.component.id)) current = (voltage - branch.value) / (branch.resistance ?? 1);
    if ((["led", "diode"].includes(branch.component.type) && current > 0.001) || (branch.kind === "controlled" && Math.abs(current) > 0.001)) activeComponentIds.push(branch.component.id);
    measurements.push({ label: `${branch.measurementLabel ?? branch.component.label}: V / I`, value: `${voltage.toFixed(3)} V · ${(current * 1000).toFixed(3)} mA` });
    if (branch.component.type === "led" && current * 1000 > finiteProperty(branch.component, "maxCurrent", 20)) {
      measurements.push({ label: `Advertencia ${branch.component.label}`, value: `Sobrecorriente: ${(current * 1000).toFixed(2)} mA` });
    }
  }
  const acSource = circuit.components.find((component) => component.type === "voltage_source_ac");
  const acFrequency = acSource ? Math.max(0,finiteProperty(acSource,"frequency",50)) : 0;
  return {
    supported: true,
    title: acSource ? "Simulación instantánea AC" : "Punto de operación DC calculado",
    summary: acSource ? "Se resolvió la red para la fase instantánea de la señal AC. Los LED/diodos conducen según la polaridad y amplitud presentes en este instante." : activeComponentIds.length ? "Se detectó corriente directa en: " + activeComponentIds.map((id) => circuit.components.find((c) => c.id === id)?.label ?? id).join(", ") + ". Los símbolos LED/diodo pueden mostrarse encendidos. Revisá las advertencias de corriente máxima." : "Se resolvió el punto de operación. Ningún LED/diodo supera el umbral de corriente de encendido en este modelo.",
    measurements,
    activeComponentIds,
    ...(acSource ? { transient: {
      kind: "ac" as const, frequencyHz: acFrequency, sourceVoltage: finiteProperty(acSource,"voltage",0),
      resistance: 0, initialCurrentA: 0, finalCurrentA: 0,
      componentIds: circuit.components.filter((component) => component.type === "voltage_source_ac").map((component) => component.id),
      ledIds: circuit.components.filter((component) => component.type === "led").map((component) => component.id),
    } } : {}),
    disclaimer: acSource ? "Solver instantáneo por fase para fuente sinusoidal ideal. Se vuelve a calcular cada cuadro; no incluye respuesta en frecuencia compleja, transformadores acoplados ni modelos SPICE de componentes no lineales." : "Análisis DC de red mediante MNA con resistencias ideales, diodos lineales por tramos y transistores/MOSFET como interruptores de umbral. No calcula ganancia analógica de transistores, transitorios generales ni integrados; motores/lámparas usan equivalentes simplificados. No reemplaza Livewire, Proteus ni SPICE validado.",
  };
}
