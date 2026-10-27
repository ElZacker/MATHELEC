import assert from "node:assert/strict";
import test from "node:test";
import { createComponent, getComponentDefinition } from "../lib/circuits/components";
import { runDcSimulation } from "../lib/circuits/simulation";
import type { Circuit } from "../lib/circuits/types";
import { buildKnownCircuitProposal } from "../lib/circuits/known-circuit-templates";

function materializeProposal(proposal: NonNullable<ReturnType<typeof buildKnownCircuitProposal>>): Circuit {
  const components = proposal.components.map((item, index) => {
    const created = createComponent(item.type, "test-component-" + index, item.x, item.y);
    return {
      ...created,
      properties: { ...created.properties, ...(item.properties ?? {}) },
    };
  });
  const wires: Circuit["wires"] = proposal.wires.map((wire, index) => ({
    id: "test-wire-" + index,
    from: {
      componentId: components[wire.from.componentIndex].id,
      terminalId: wire.from.terminalId,
    },
    to: {
      componentId: components[wire.to.componentIndex].id,
      terminalId: wire.to.terminalId,
    },
  }));
  return {
    id: "template-test",
    name: proposal.title,
    version: 1,
    components,
    wires,
    createdAt: "",
    updatedAt: "",
  };
}

const prompts = [
  "Diseñar un LED intermitente con un NE555",
  "genera un circuito cualquiera que prenda un led",
  "haceme un circuito detector de mentiras",
  "haceme un detector de proximidad",
  "control de giro de motor DC",
  "amplificador de base común",
  "armame un secuenciador de LEDs con CD4017",
];

test("Las plantillas conocidas producen conexiones completas con terminales reales", () => {
  for (const prompt of prompts) {
    const proposal = buildKnownCircuitProposal(prompt);
    assert.ok(proposal, "No se generó una plantilla para: " + prompt);
    assert.ok(proposal.components.length >= 2);
    assert.ok(proposal.components.length <= 30);
    assert.ok(proposal.wires.length > 0);
    assert.ok(proposal.wires.length <= 40);

    const connected = new Set<string>();
    const seenWires = new Set<string>();
    for (const wire of proposal.wires) {
      assert.ok(Number.isInteger(wire.from.componentIndex));
      assert.ok(Number.isInteger(wire.to.componentIndex));
      assert.ok(wire.from.componentIndex >= 0 && wire.from.componentIndex < proposal.components.length);
      assert.ok(wire.to.componentIndex >= 0 && wire.to.componentIndex < proposal.components.length);
      const fromType = proposal.components[wire.from.componentIndex].type;
      const toType = proposal.components[wire.to.componentIndex].type;
      const fromTerminals = getComponentDefinition(fromType).terminals.map((terminal) => terminal.id);
      const toTerminals = getComponentDefinition(toType).terminals.map((terminal) => terminal.id);
      assert.ok(fromTerminals.includes(wire.from.terminalId), "Terminal de origen inválido en " + prompt);
      assert.ok(toTerminals.includes(wire.to.terminalId), "Terminal de destino inválido en " + prompt);
      const fromKey = wire.from.componentIndex + ":" + wire.from.terminalId;
      const toKey = wire.to.componentIndex + ":" + wire.to.terminalId;
      assert.notEqual(fromKey,toKey);
      const wireKey = [fromKey,toKey].sort().join("<->");
      assert.ok(!seenWires.has(wireKey), "Cable duplicado en " + prompt);
      seenWires.add(wireKey);
      connected.add(fromKey);
      connected.add(toKey);
    }
    proposal.components.forEach((component,index) => {
      for (const terminal of getComponentDefinition(component.type).terminals) {
        assert.ok(connected.has(index + ":" + terminal.id),
          "Terminal abierto " + component.type + "." + terminal.id + " en el pedido: " + prompt);
      }
    });
  }
});

test("Una petición explícita sin conexiones no activa plantillas cableadas", () => {
  assert.equal(buildKnownCircuitProposal("genera un circuito con LED sin conexiones"), null);
  assert.equal(buildKnownCircuitProposal("poneme componentes sueltos sin cables"), null);
});

test("Las plantillas de LED, NE555 y CD4017 son aceptadas por sus modelos de simulación", () => {
  const led = buildKnownCircuitProposal("genera un circuito cualquiera que prenda un led");
  assert.ok(led);
  const ledResult = runDcSimulation(materializeProposal(led));
  assert.equal(ledResult.supported, true, ledResult.summary);
  assert.ok(ledResult.activeComponentIds?.length);

  const flasher = buildKnownCircuitProposal("Diseñar un LED intermitente con un NE555");
  assert.ok(flasher);
  const flasherResult = runDcSimulation(materializeProposal(flasher));
  assert.equal(flasherResult.supported, true, flasherResult.summary);
  assert.ok(flasherResult.oscillation);
  assert.ok(Math.abs(1000 / (flasherResult.oscillation?.periodMs ?? 0) - 0.63) < 0.03);

  const chaser = buildKnownCircuitProposal("armame un secuenciador de LEDs con CD4017");
  assert.ok(chaser);
  const chaserResult = runDcSimulation(materializeProposal(chaser));
  assert.equal(chaserResult.supported, true, chaserResult.summary);
  assert.ok(chaserResult.sequencer);
  assert.equal(chaserResult.sequencer?.steps.length, 6);
});

