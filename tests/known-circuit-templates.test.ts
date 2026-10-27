import assert from "node:assert/strict";
import test from "node:test";
import { getComponentDefinition } from "../lib/circuits/components";
import { buildKnownCircuitProposal } from "../lib/circuits/known-circuit-templates";

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
