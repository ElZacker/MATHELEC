import type { Circuit, CircuitComponent } from "./types";

export type SimulationResult = {
  supported: boolean;
  title: string;
  summary: string;
  measurements: { label: string; value: string }[];
  disclaimer: string;
  activeComponentIds?: string[];
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

/**
 * DC operating-point solver using modified nodal analysis. Handles multiple
 * loops/parallel branches for supported two-terminal DC models. Diodes use an
 * iterative piecewise-linear approximation, not a manufacturer SPICE model.
 */
export function runDcSimulation(circuit: Circuit): SimulationResult {
  if (!circuit.components.length) return unsupported("Agregá componentes antes de iniciar la simulación.");
  const allowed = new Set(["battery", "cell", "voltage_source_dc", "resistor", "led", "diode", "switch", "switch_spst", "fuse", "lamp", "motor", "ldr", "thermistor", "potentiometer"]);
  const unsupportedComponents = circuit.components.filter((c) => !allowed.has(c.type));
  if (unsupportedComponents.length) return unsupported("Todavía faltan modelos eléctricos para: " + unsupportedComponents.map((c) => `${c.label} (${c.type})`).join(", ") + ". La biblioteca visual es más amplia que los modelos de simulación; no se puede afirmar que esos componentes funcionen físicamente todavía.");
  if (circuit.components.some((c) => c.terminals.length !== 2)) return unsupported("Esta versión resuelve componentes de dos terminales. Los integrados, transistores y otros componentes multipin requieren modelos específicos que aún no están implementados.");
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
        if (c.type === "potentiometer") resistance = Math.max(1e-3, resistance / 2);
        if (["switch", "switch_spst"].includes(c.type) || c.type === "fuse") {
          const closed = c.type === "fuse" || c.properties.closed === true;
          resistance = closed ? (c.type === "fuse" ? 0.05 : 1e-3) : 1e12;
        }
        if (["resistor", "motor", "lamp", "ldr", "thermistor", "potentiometer"].includes(c.type) && resistance <= 0) return unsupported(`${c.label}: resistencia inválida.`);
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
