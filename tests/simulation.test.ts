import assert from "node:assert/strict";
import test from "node:test";
import { runDcSimulation } from "../lib/circuits/simulation";
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
