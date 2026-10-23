
import type {
  ComponentType,
  CircuitComponent,
  Terminal,
} from "./types";

type ComponentDefinition = {
  type: ComponentType;
  label: string;
  properties: Record<string, string | number | boolean>;
  terminals: Terminal[];
};

const definitions: Record<ComponentType, ComponentDefinition> = {
  battery: {
    type: "battery",
    label: "BAT1",
    properties: {
      voltage: 9,
      description: "Fuente de tensión continua",
    },
    terminals: [
      { id: "positive", name: "+", position: { x: 0, y: -20 } },
      { id: "negative", name: "−", position: { x: 0, y: 20 } },
    ],
  },

  resistor: {
    type: "resistor",
    label: "R1",
    properties: {
      resistance: 220,
      tolerance: 5,
      unit: "Ω",
    },
    terminals: [
      { id: "a", name: "A", position: { x: -25, y: 0 } },
      { id: "b", name: "B", position: { x: 25, y: 0 } },
    ],
  },

  led: {
    type: "led",
    label: "D1",
    properties: {
      color: "red",
      forwardVoltage: 2,
      maxCurrent: 20,
    },
    terminals: [
      { id: "anode", name: "Ánodo (+)", position: { x: -20, y: 0 } },
      { id: "cathode", name: "Cátodo (−)", position: { x: 20, y: 0 } },
    ],
  },

  switch: {
    type: "switch",
    label: "SW1",
    properties: {
      closed: false,
      description: "Interruptor simple",
    },
    terminals: [
      { id: "a", name: "A", position: { x: -20, y: 0 } },
      { id: "b", name: "B", position: { x: 20, y: 0 } },
    ],
  },

  ground: {
    type: "ground",
    label: "GND1",
    properties: {
      description: "Referencia de potencial",
    },
    terminals: [
      { id: "gnd", name: "GND", position: { x: 0, y: -10 } },
    ],
  },
};

/** Devuelve la definición base de un tipo de componente. */
export function getComponentDefinition(
  type: ComponentType,
): ComponentDefinition {
  const definition = definitions[type];

  return {
    ...definition,
    properties: { ...definition.properties },
    terminals: definition.terminals.map((terminal) => ({
      ...terminal,
      position: { ...terminal.position },
    })),
  };
}

/** Crea una nueva instancia de un componente en el circuito. */
export function createComponent(
  type: ComponentType,
  id: string,
  x = 100,
  y = 100,
): CircuitComponent {
  const definition = getComponentDefinition(type);

  return {
    id,
    type,
    label: definition.label,
    position: { x, y },
    rotation: 0,
    properties: definition.properties,
    terminals: definition.terminals,
  };
}

/** Lista los tipos de componentes disponibles. */
export function getAvailableComponentTypes(): ComponentType[] {
  return Object.keys(definitions) as ComponentType[];
}
