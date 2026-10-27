import assert from "node:assert/strict";
import test from "node:test";
import { runDcSimulation } from "../lib/circuits/simulation";
import { createTransientState, runTransientStep } from "../lib/circuits/transient-simulation";
import type { Circuit, CircuitComponent, ComponentType } from "../lib/circuits/types";

function component(
  id: string,
  type: ComponentType,
  terminalIds: string[],
  properties: Record<string, string | number | boolean> = {},
): CircuitComponent {
  return {
    id,
    type,
    label: id,
    position: { x: 100, y: 100 },
    rotation: 0,
    properties,
    terminals: terminalIds.map((terminalId, index) => ({
      id: terminalId,
      name: terminalId,
      position: { x: index * 10, y: 0 },
    })),
  };
}

type Endpoint = { componentId: string; terminalId: string };
function wire(id: string, from: Endpoint, to: Endpoint) {
  return { id, from, to };
}
function circuit(components: CircuitComponent[], wires: Circuit["wires"]): Circuit {
  return {
    id: "test-circuit",
    name: "Circuito de prueba",
    version: 1,
    components,
    wires,
    createdAt: "",
    updatedAt: "",
  };
}

const source = (voltage = 9, type: ComponentType = "battery") =>
  component("BAT1", type, ["positive", "negative"], { voltage });

test("DC: LED en directa con resistencia limitadora queda activo y da una corriente plausible", () => {
  const model = circuit([
    source(9),
    component("R1", "resistor", ["a", "b"], { resistance: 390 }),
    component("D1", "led", ["anode", "cathode"], { forwardVoltage: 2, maxCurrent: 20 }),
  ], [
    wire("W1", { componentId: "BAT1", terminalId: "positive" }, { componentId: "R1", terminalId: "a" }),
    wire("W2", { componentId: "R1", terminalId: "b" }, { componentId: "D1", terminalId: "anode" }),
    wire("W3", { componentId: "D1", terminalId: "cathode" }, { componentId: "BAT1", terminalId: "negative" }),
  ]);

  const result = runDcSimulation(model);
  assert.equal(result.supported, true, result.summary);
  assert.ok(result.activeComponentIds?.includes("D1"), "El LED debería aparecer encendido.");
  const measurement = result.measurements.find((item) => item.label === "D1: V / I");
  assert.ok(measurement, "Debe devolver mediciones del LED.");
  const currentMa = Number(measurement.value.match(/([\d.]+) mA/)?.[1]);
  assert.ok(currentMa > 17 && currentMa < 19, "La corriente debería rondar 18 mA.");
});

test("DC: LED invertido no aparece encendido", () => {
  const model = circuit([
    source(9),
    component("R1", "resistor", ["a", "b"], { resistance: 390 }),
    component("D1", "led", ["anode", "cathode"], { forwardVoltage: 2, maxCurrent: 20 }),
  ], [
    wire("W1", { componentId: "BAT1", terminalId: "positive" }, { componentId: "R1", terminalId: "a" }),
    wire("W2", { componentId: "R1", terminalId: "b" }, { componentId: "D1", terminalId: "cathode" }),
    wire("W3", { componentId: "D1", terminalId: "anode" }, { componentId: "BAT1", terminalId: "negative" }),
  ]);

  const result = runDcSimulation(model);
  assert.equal(result.supported, true, result.summary);
  assert.ok(!result.activeComponentIds?.includes("D1"), "Un LED en inversa no debe iluminarse.");
});

test("Transitorio RC: calcula tau = R·C", () => {
  const model = circuit([
    source(9),
    component("R1", "resistor", ["a", "b"], { resistance: 10000 }),
    component("C1", "capacitor", ["a", "b"], { capacitance: 10, unit: "µF" }),
  ], [
    wire("W1", { componentId: "BAT1", terminalId: "positive" }, { componentId: "R1", terminalId: "a" }),
    wire("W2", { componentId: "R1", terminalId: "b" }, { componentId: "C1", terminalId: "a" }),
    wire("W3", { componentId: "C1", terminalId: "b" }, { componentId: "BAT1", terminalId: "negative" }),
  ]);

  const result = runDcSimulation(model);
  assert.equal(result.supported, true, result.summary);
  assert.equal(result.transient?.kind, "rc");
  assert.ok(Math.abs((result.transient?.timeConstantMs ?? 0) - 100) < 0.01);
});

test("Transitorio RL: calcula tau = L/R", () => {
  const model = circuit([
    source(9),
    component("R1", "resistor", ["a", "b"], { resistance: 100 }),
    component("L1", "inductor", ["a", "b"], { inductance: 10, unit: "mH" }),
  ], [
    wire("W1", { componentId: "BAT1", terminalId: "positive" }, { componentId: "R1", terminalId: "a" }),
    wire("W2", { componentId: "R1", terminalId: "b" }, { componentId: "L1", terminalId: "a" }),
    wire("W3", { componentId: "L1", terminalId: "b" }, { componentId: "BAT1", terminalId: "negative" }),
  ]);

  const result = runDcSimulation(model);
  assert.equal(result.supported, true, result.summary);
  assert.equal(result.transient?.kind, "rl");
  assert.ok(Math.abs((result.transient?.timeConstantMs ?? 0) - 0.1) < 0.001);
});

test("Motor DC: devuelve un arranque transitorio con valores finitos", () => {
  const model = circuit([
    source(6),
    component("M1", "motor", ["positive", "negative"], {
      voltage: 6, resistance: 12, inductance: 20, inductanceUnit: "mH", mechanicalTimeConstantMs: 250,
    }),
  ], [
    wire("W1", { componentId: "BAT1", terminalId: "positive" }, { componentId: "M1", terminalId: "positive" }),
    wire("W2", { componentId: "M1", terminalId: "negative" }, { componentId: "BAT1", terminalId: "negative" }),
  ]);

  const result = runDcSimulation(model);
  assert.equal(result.supported, true, result.summary);
  assert.equal(result.transient?.kind, "motor");
  assert.ok(Number.isFinite(result.transient?.timeConstantMs));
  assert.ok((result.transient?.finalCurrentA ?? 0) > 0);
});

test("NE555 astable: calcula frecuencia y LED asociado a la salida", () => {
  const components = [
    source(9),
    component("U1", "ic_555", ["gnd", "trigger", "output", "reset", "vcc", "threshold", "discharge", "control"]),
    component("R1", "resistor", ["a", "b"], { resistance: 10000 }),
    component("R2", "resistor", ["a", "b"], { resistance: 47000 }),
    component("C1", "capacitor", ["a", "b"], { capacitance: 22, unit: "µF" }),
    component("R3", "resistor", ["a", "b"], { resistance: 390 }),
    component("D1", "led", ["anode", "cathode"], { forwardVoltage: 2, maxCurrent: 20 }),
    component("GND1", "ground", ["gnd"]),
  ];
  const wires = [
    wire("W1", { componentId: "BAT1", terminalId: "positive" }, { componentId: "U1", terminalId: "vcc" }),
    wire("W2", { componentId: "BAT1", terminalId: "negative" }, { componentId: "U1", terminalId: "gnd" }),
    wire("W3", { componentId: "BAT1", terminalId: "positive" }, { componentId: "U1", terminalId: "reset" }),
    wire("W4", { componentId: "BAT1", terminalId: "positive" }, { componentId: "R1", terminalId: "a" }),
    wire("W5", { componentId: "R1", terminalId: "b" }, { componentId: "U1", terminalId: "discharge" }),
    wire("W6", { componentId: "U1", terminalId: "discharge" }, { componentId: "R2", terminalId: "a" }),
    wire("W7", { componentId: "R2", terminalId: "b" }, { componentId: "U1", terminalId: "threshold" }),
    wire("W8", { componentId: "U1", terminalId: "threshold" }, { componentId: "U1", terminalId: "trigger" }),
    wire("W9", { componentId: "U1", terminalId: "threshold" }, { componentId: "C1", terminalId: "a" }),
    wire("W10", { componentId: "C1", terminalId: "b" }, { componentId: "BAT1", terminalId: "negative" }),
    wire("W11", { componentId: "U1", terminalId: "control" }, { componentId: "GND1", terminalId: "gnd" }),
    wire("W12", { componentId: "GND1", terminalId: "gnd" }, { componentId: "BAT1", terminalId: "negative" }),
    wire("W13", { componentId: "U1", terminalId: "output" }, { componentId: "R3", terminalId: "a" }),
    wire("W14", { componentId: "R3", terminalId: "b" }, { componentId: "D1", terminalId: "anode" }),
    wire("W15", { componentId: "D1", terminalId: "cathode" }, { componentId: "BAT1", terminalId: "negative" }),
  ];

  const result = runDcSimulation(circuit(components, wires));
  assert.equal(result.supported, true, result.summary);
  assert.ok(result.oscillation);
  assert.ok(Math.abs(1000 / (result.oscillation?.periodMs ?? 0) - 0.63) < 0.03);
  assert.ok(result.oscillation?.componentIds.includes("D1"));
});

test("Transistor NPN con polarización de base conmuta la carga LED", () => {
  const model = circuit([
    source(5),
    component("RLED", "resistor", ["a", "b"], { resistance: 390 }),
    component("D1", "led", ["anode", "cathode"], { forwardVoltage: 2, maxCurrent: 20 }),
    component("Q1", "npn_transistor", ["base", "collector", "emitter"], { vbeOn: 0.65, onResistance: 25 }),
    component("RB", "resistor", ["a", "b"], { resistance: 1000 }),
  ], [
    wire("W1", { componentId: "BAT1", terminalId: "positive" }, { componentId: "RLED", terminalId: "a" }),
    wire("W2", { componentId: "RLED", terminalId: "b" }, { componentId: "D1", terminalId: "anode" }),
    wire("W3", { componentId: "D1", terminalId: "cathode" }, { componentId: "Q1", terminalId: "collector" }),
    wire("W4", { componentId: "Q1", terminalId: "emitter" }, { componentId: "BAT1", terminalId: "negative" }),
    wire("W5", { componentId: "BAT1", terminalId: "positive" }, { componentId: "RB", terminalId: "a" }),
    wire("W6", { componentId: "RB", terminalId: "b" }, { componentId: "Q1", terminalId: "base" }),
  ]);

  const result = runDcSimulation(model);
  assert.equal(result.supported, true, result.summary);
  assert.ok(result.activeComponentIds?.includes("D1"), "El NPN activado debe permitir corriente por la carga.");
});

test("Fuente de corriente DC: resuelve una carga resistiva", () => {
  const model = circuit([
    component("I1", "current_source", ["a", "b"], { current: 0.01 }),
    component("R1", "resistor", ["a", "b"], { resistance: 1000 }),
  ], [
    wire("W1", { componentId: "I1", terminalId: "a" }, { componentId: "R1", terminalId: "a" }),
    wire("W2", { componentId: "I1", terminalId: "b" }, { componentId: "R1", terminalId: "b" }),
  ]);
  const result = runDcSimulation(model);
  assert.equal(result.supported, true, result.summary);
  const current = result.measurements.find((item) => item.label === "I1: V / I");
  assert.ok(current?.value.includes("10.000 mA"));
});

test("Potenciómetro: divide la resistencia entre A-cursor y cursor-B", () => {
  const model = circuit([
    source(5),
    component("RV1", "potentiometer", ["a", "wiper", "b"], { resistance: 10000, position: 0.5 }),
    component("R1", "resistor", ["a", "b"], { resistance: 1000 }),
  ], [
    wire("W1", { componentId: "BAT1", terminalId: "positive" }, { componentId: "RV1", terminalId: "a" }),
    wire("W2", { componentId: "RV1", terminalId: "b" }, { componentId: "BAT1", terminalId: "negative" }),
    wire("W3", { componentId: "RV1", terminalId: "wiper" }, { componentId: "R1", terminalId: "a" }),
    wire("W4", { componentId: "R1", terminalId: "b" }, { componentId: "BAT1", terminalId: "negative" }),
  ]);
  const result = runDcSimulation(model);
  assert.equal(result.supported, true, result.summary);
  assert.ok(result.measurements.some((item) => item.label === "RV1 A-cursor: V / I"));
  assert.ok(result.measurements.some((item) => item.label === "RV1 cursor-B: V / I"));
});

test("Fuente AC: el solver cambia la tensión instantánea con la fase", () => {
  const model = circuit([
    component("VAC1", "voltage_source_ac", ["positive", "negative"], { voltage: 5, frequency: 50, unit: "V RMS" }),
    component("R1", "resistor", ["a", "b"], { resistance: 1000 }),
  ], [
    wire("W1", { componentId: "VAC1", terminalId: "positive" }, { componentId: "R1", terminalId: "a" }),
    wire("W2", { componentId: "R1", terminalId: "b" }, { componentId: "VAC1", terminalId: "negative" }),
  ]);
  const zero = runDcSimulation(model, 0);
  const peak = runDcSimulation(model, 1 / 200);
  assert.equal(zero.supported, true, zero.summary);
  assert.equal(peak.supported, true, peak.summary);
  const current = peak.measurements.find((item) => item.label === "R1: V / I");
  assert.ok(current?.value.includes("7.071 mA"));
});

test("Backward Euler: la carga RC avanza un paso temporal coherente", () => {
  const model = circuit([
    source(5),
    component("R1", "resistor", ["a", "b"], { resistance: 1000 }),
    component("C1", "capacitor", ["a", "b"], { capacitance: 10, unit: "µF" }),
  ], [
    wire("W1", { componentId: "BAT1", terminalId: "positive" }, { componentId: "R1", terminalId: "a" }),
    wire("W2", { componentId: "R1", terminalId: "b" }, { componentId: "C1", terminalId: "a" }),
    wire("W3", { componentId: "C1", terminalId: "b" }, { componentId: "BAT1", terminalId: "negative" }),
  ]);
  const step = runTransientStep(model, 0.001, createTransientState());
  assert.equal(step.result.supported, true, step.result.summary);
  assert.equal(step.result.transient?.kind, "network");
  assert.ok(step.state.timeSeconds > 0);
  const cap = step.result.measurements.find((item) => item.label === "C1: V / I");
  assert.ok(cap);
  const volts = Number(cap.value.match(/([\d.]+) V/)?.[1]);
  assert.ok(volts > 0.4 && volts < 0.5, "Primer paso RC debería ser cercano a 0,455 V.");
  const next = runTransientStep(model, 0.001, step.state);
  const capNext = next.result.measurements.find((item) => item.label === "C1: V / I");
  assert.ok(capNext);
  const voltsNext = Number(capNext.value.match(/([\d.]+) V/)?.[1]);
  assert.ok(voltsNext > volts, "La tensión del capacitor debe crecer durante la carga.");
});

test("Backward Euler: red RL guarda y acumula corriente del inductor", () => {
  const model = circuit([
    source(5),
    component("R1", "resistor", ["a", "b"], { resistance: 100 }),
    component("L1", "inductor", ["a", "b"], { inductance: 10, unit: "mH" }),
  ], [
    wire("W1", { componentId: "BAT1", terminalId: "positive" }, { componentId: "R1", terminalId: "a" }),
    wire("W2", { componentId: "R1", terminalId: "b" }, { componentId: "L1", terminalId: "a" }),
    wire("W3", { componentId: "L1", terminalId: "b" }, { componentId: "BAT1", terminalId: "negative" }),
  ]);
  const first = runTransientStep(model, 0.001, createTransientState());
  assert.equal(first.result.supported, true, first.result.summary);
  const second = runTransientStep(model, 0.001, first.state);
  assert.equal(second.result.supported, true, second.result.summary);
  assert.ok((second.state.inductorCurrents.L1 ?? 0) > (first.state.inductorCurrents.L1 ?? 0));
});

test("Fuente AC: pasos temporales adyacentes producen distinta tensión instantánea", () => {
  const model = circuit([
    component("VAC1", "voltage_source_ac", ["positive", "negative"], { voltage: 5, frequency: 50, unit: "V RMS" }),
    component("R1", "resistor", ["a", "b"], { resistance: 1000 }),
  ], [
    wire("W1", { componentId: "VAC1", terminalId: "positive" }, { componentId: "R1", terminalId: "a" }),
    wire("W2", { componentId: "R1", terminalId: "b" }, { componentId: "VAC1", terminalId: "negative" }),
  ]);
  const state0 = createTransientState();
  const first = runTransientStep(model, 0.001, state0);
  assert.equal(first.result.supported, true, first.result.summary);
  const second = runTransientStep(model, 0.001, first.state);
  assert.equal(second.result.supported, true, second.result.summary);
  const current1 = Number(first.result.measurements.find((item) => item.label === "R1: V / I")?.value.match(/([\d.]+) mA/)?.[1]);
  const current2 = Number(second.result.measurements.find((item) => item.label === "R1: V / I")?.value.match(/([\d.]+) mA/)?.[1]);
  assert.ok(Number.isFinite(current1) && Number.isFinite(current2));
  assert.notEqual(current1,current2);
});

test("Backward Euler: resuelve dos ramas RC en paralelo en el mismo paso", () => {
  const model = circuit([
    source(5),
    component("R1", "resistor", ["a", "b"], { resistance: 1000 }),
    component("C1", "capacitor", ["a", "b"], { capacitance: 10, unit: "µF" }),
    component("R2", "resistor", ["a", "b"], { resistance: 2000 }),
    component("C2", "capacitor", ["a", "b"], { capacitance: 22, unit: "µF" }),
  ], [
    wire("W1", { componentId: "BAT1", terminalId: "positive" }, { componentId: "R1", terminalId: "a" }),
    wire("W2", { componentId: "R1", terminalId: "b" }, { componentId: "C1", terminalId: "a" }),
    wire("W3", { componentId: "C1", terminalId: "b" }, { componentId: "BAT1", terminalId: "negative" }),
    wire("W4", { componentId: "BAT1", terminalId: "positive" }, { componentId: "R2", terminalId: "a" }),
    wire("W5", { componentId: "R2", terminalId: "b" }, { componentId: "C2", terminalId: "a" }),
    wire("W6", { componentId: "C2", terminalId: "b" }, { componentId: "BAT1", terminalId: "negative" }),
  ]);
  const step = runTransientStep(model, 0.001, createTransientState());
  assert.equal(step.result.supported, true, step.result.summary);
  assert.ok(step.result.measurements.some((item) => item.label === "C1: V / I"));
  assert.ok(step.result.measurements.some((item) => item.label === "C2: V / I"));
  assert.ok((step.state.capacitorVoltages.C1 ?? 0) > 0);
  assert.ok((step.state.capacitorVoltages.C2 ?? 0) > 0);
});

test("BJT exponencial: resuelve corriente de base y colector en la carga", () => {
  const model = circuit([
    source(5),
    component("RLED", "resistor", ["a", "b"], { resistance: 390 }),
    component("D1", "led", ["anode", "cathode"], { forwardVoltage: 2, maxCurrent: 20 }),
    component("Q1", "npn_transistor", ["base", "collector", "emitter"], { beta: 100, saturationCurrent: 1e-14, vceSaturation: 0.2 }),
    component("RB", "resistor", ["a", "b"], { resistance: 1000 }),
  ], [
    wire("W1", { componentId: "BAT1", terminalId: "positive" }, { componentId: "RLED", terminalId: "a" }),
    wire("W2", { componentId: "RLED", terminalId: "b" }, { componentId: "D1", terminalId: "anode" }),
    wire("W3", { componentId: "D1", terminalId: "cathode" }, { componentId: "Q1", terminalId: "collector" }),
    wire("W4", { componentId: "Q1", terminalId: "emitter" }, { componentId: "BAT1", terminalId: "negative" }),
    wire("W5", { componentId: "BAT1", terminalId: "positive" }, { componentId: "RB", terminalId: "a" }),
    wire("W6", { componentId: "RB", terminalId: "b" }, { componentId: "Q1", terminalId: "base" }),
  ]);
  const result = runTransientStep(model, 0.001, createTransientState());
  assert.equal(result.result.supported, true, result.result.summary);
  const base = result.result.measurements.find((item) => item.label === "Q1: Vbe / Ib");
  const collector = result.result.measurements.find((item) => item.label === "Q1: Vce / Ic");
  assert.ok(base, "Debe mostrar VBE y corriente de base.");
  assert.ok(collector, "Debe mostrar VCE y corriente de colector.");
  const vbe = Number(base.value.match(/([\d.]+) V/)?.[1]);
  const icMa = Number(collector.value.match(/([\d.]+) mA/)?.[1]);
  assert.ok(vbe > 0.5 && vbe < 0.9, "VBE debería caer cerca del valor directo típico.");
  assert.ok(icMa > 1 && icMa < 30, "La corriente de colector debe quedar limitada por la carga.");
});

