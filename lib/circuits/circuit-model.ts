
import type {
  Circuit,
  CircuitComponent,
  CircuitWire,
  ComponentType,
} from "./types";

import { createComponent } from "./components";

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function updateTimestamp(circuit: Circuit): string {
  return new Date().toISOString();
}

/** Crea un circuito vacío. */
export function createCircuit(
  name = "Nuevo circuito",
  id = makeId("circuit"),
): Circuit {
  const now = new Date().toISOString();

  return {
    id,
    name,
    version: 1,
    components: [],
    wires: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Agrega un componente al circuito. */
export function addComponent(
  circuit: Circuit,
  type: ComponentType,
  x = 100,
  y = 100,
  id = makeId(type),
): Circuit {
  if (circuit.components.some((component) => component.id === id)) {
    throw new Error(`Ya existe un componente con el ID "${id}".`);
  }

  const component = createComponent(type, id, x, y);

  // Asignar referencias únicas y secuenciales por tipo: R1, R2, R3; D1, D2; BAT1...
  const prefixByType: Record<ComponentType, string> = {
    battery:"BAT", resistor:"R", led:"D", switch:"SW", ground:"GND",
    diode:"D", capacitor:"C", polarized_capacitor:"C", inductor:"L",
    npn_transistor:"Q", pnp_transistor:"Q", mosfet_n:"Q", mosfet_p:"Q",
    op_amp:"U", voltage_source_ac:"VAC", current_source:"I", fuse:"F",
    motor:"M", lamp:"LP", push_button:"PB", relay:"K", photodiode:"PD",
    ldr:"LDR", thermistor:"TH", potentiometer:"RV", zener_diode:"DZ",
    logic_gate_and:"U", logic_gate_or:"U", logic_gate_not:"U",
    ic_555:"U", ic_4017:"U", connector:"J",
  };
  const prefix = prefixByType[type];
  const usedNumbers = circuit.components
    .filter((existing) => existing.label.startsWith(prefix))
    .map((existing) => Number(existing.label.match(/(\d+)$/)?.[1] ?? 0))
    .filter(Number.isFinite);
  let nextNumber = 1;
  while (usedNumbers.includes(nextNumber)) nextNumber += 1;
  component.label = `${prefix}${nextNumber}`;

  return {
    ...circuit,
    components: [...circuit.components, component],
    updatedAt: updateTimestamp(circuit),
  };
}

/** Elimina un componente y todos sus cables conectados. */
export function removeComponent(
  circuit: Circuit,
  componentId: string,
): Circuit {
  const exists = circuit.components.some(
    (component) => component.id === componentId,
  );

  if (!exists) {
    return circuit;
  }

  const components = circuit.components.filter(
    (component) => component.id !== componentId,
  );

  const wires = circuit.wires.filter(
    (wire) =>
      wire.from.componentId !== componentId &&
      wire.to.componentId !== componentId,
  );

  return {
    ...circuit,
    components,
    wires,
    updatedAt: updateTimestamp(circuit),
  };
}

/** Cambia la posición de un componente. */
export function moveComponent(
  circuit: Circuit,
  componentId: string,
  x: number,
  y: number,
): Circuit {
  const exists = circuit.components.some(
    (component) => component.id === componentId,
  );

  if (!exists) {
    throw new Error(`No existe el componente "${componentId}".`);
  }

  return {
    ...circuit,
    components: circuit.components.map((component) =>
      component.id === componentId
        ? { ...component, position: { x, y } }
        : component,
    ),
    updatedAt: updateTimestamp(circuit),
  };
}

/** Gira un componente 90 grados en sentido horario. */
export function rotateComponent(
  circuit: Circuit,
  componentId: string,
): Circuit {
  let found = false;

  const components = circuit.components.map((component) => {
    if (component.id !== componentId) {
      return component;
    }

    found = true;

    const rotation = (
      (component.rotation + 90) % 360
    ) as CircuitComponent["rotation"];

    return { ...component, rotation };
  });

  if (!found) {
    throw new Error(`No existe el componente "${componentId}".`);
  }

  return {
    ...circuit,
    components,
    updatedAt: updateTimestamp(circuit),
  };
}


/** Actualiza una o varias propiedades de un componente. */
export function updateComponentProperties(
  circuit: Circuit,
  componentId: string,
  properties: Partial<
    Record<string, string | number | boolean>
  >,
): Circuit {
  const exists = circuit.components.some(
    (component) => component.id === componentId,
  );

  if (!exists) {
    throw new Error(`No existe el componente "${componentId}".`);
  }

  const components: CircuitComponent[] =
    circuit.components.map((component) => {
      if (component.id !== componentId) {
        return component;
      }

      const updatedProperties: Record<
        string,
        string | number | boolean
      > = { ...component.properties };

      for (const [key, value] of Object.entries(properties)) {
        if (value !== undefined) {
          updatedProperties[key] = value;
        }
      }

      return {
        ...component,
        properties: updatedProperties,
      };
    });

  return {
    ...circuit,
    components,
    updatedAt: updateTimestamp(circuit),
  };
}


/** Conecta dos terminales existentes. */
export function connectTerminals(
  circuit: Circuit,
  fromComponentId: string,
  fromTerminalId: string,
  toComponentId: string,
  toTerminalId: string,
  wireId = makeId("wire"),
  points: { x: number; y: number }[] = [],
): Circuit {
  const fromComponent = circuit.components.find(
    (component) => component.id === fromComponentId,
  );

  const toComponent = circuit.components.find(
    (component) => component.id === toComponentId,
  );

  if (!fromComponent || !toComponent) {
    throw new Error(
      "No se puede conectar: uno de los componentes no existe.",
    );
  }

  const fromTerminal = fromComponent.terminals.find(
    (terminal) => terminal.id === fromTerminalId,
  );

  const toTerminal = toComponent.terminals.find(
    (terminal) => terminal.id === toTerminalId,
  );

  if (!fromTerminal || !toTerminal) {
    throw new Error(
      "No se puede conectar: uno de los terminales no existe.",
    );
  }

  if (
    fromComponentId === toComponentId &&
    fromTerminalId === toTerminalId
  ) {
    throw new Error(
      "No se puede conectar un terminal consigo mismo.",
    );
  }

  const duplicate = circuit.wires.some(
    (wire) =>
      (
        wire.from.componentId === fromComponentId &&
        wire.from.terminalId === fromTerminalId &&
        wire.to.componentId === toComponentId &&
        wire.to.terminalId === toTerminalId
      ) ||
      (
        wire.from.componentId === toComponentId &&
        wire.from.terminalId === toTerminalId &&
        wire.to.componentId === fromComponentId &&
        wire.to.terminalId === fromTerminalId
      ),
  );

  if (duplicate) {
    throw new Error("Esas terminales ya están conectadas.");
  }

  if (circuit.wires.some((wire) => wire.id === wireId)) {
    throw new Error(`Ya existe un cable con el ID "${wireId}".`);
  }

  const wire: CircuitWire = {
    id: wireId,
    from: {
      componentId: fromComponentId,
      terminalId: fromTerminalId,
    },
    to: {
      componentId: toComponentId,
      terminalId: toTerminalId,
    },
    ...(points.length > 0 ? { points: points.map((point) => ({ ...point })) } : {}),
  };

  return {
    ...circuit,
    wires: [...circuit.wires, wire],
    updatedAt: updateTimestamp(circuit),
  };
}

/** Desconecta y elimina un cable. */
export function disconnectWire(
  circuit: Circuit,
  wireId: string,
): Circuit {
  const wires = circuit.wires.filter(
    (wire) => wire.id !== wireId,
  );

  if (wires.length === circuit.wires.length) {
    return circuit;
  }

  return {
    ...circuit,
    wires,
    updatedAt: updateTimestamp(circuit),
  };
}
