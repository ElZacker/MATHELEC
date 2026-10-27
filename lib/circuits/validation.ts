
import type {
  Circuit,
  ValidationIssue,
} from "./types";

/**
 * Comprueba la estructura del circuito.
 *
 * Importante: esto NO reemplaza una simulación eléctrica.
 */
export function validateCircuit(
  circuit: Circuit,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. Comprobar que haya componentes.
  if (circuit.components.length === 0) {
    issues.push({
      severity: "warning",
      code: "EMPTY_CIRCUIT",
      message: "El circuito todavía no tiene componentes.",
    });
  }

  const componentIds = new Set<string>();

  // 2. Revisar componentes y sus propiedades básicas.
  for (const component of circuit.components) {
    if (componentIds.has(component.id)) {
      issues.push({
        severity: "error",
        code: "DUPLICATE_COMPONENT_ID",
        message: `El ID "${component.id}" está repetido.`,
        componentIds: [component.id],
      });
    }

    componentIds.add(component.id);

    if (!Number.isFinite(component.position.x) || !Number.isFinite(component.position.y)) {
      issues.push({
        severity: "error",
        code: "INVALID_COMPONENT_POSITION",
        message: `${component.label} tiene coordenadas inválidas.`,
        componentIds: [component.id],
      });
    }

    const terminalIds = new Set<string>();

    for (const terminal of component.terminals) {
      if (terminalIds.has(terminal.id)) {
        issues.push({
          severity: "error",
          code: "DUPLICATE_TERMINAL_ID",
          message: `El terminal "${terminal.id}" está repetido en ${component.label}.`,
          componentIds: [component.id],
        });
      }

      terminalIds.add(terminal.id);
    }

    if (
      component.type === "resistor" &&
      (
        typeof component.properties.resistance !== "number" ||
        component.properties.resistance <= 0
      )
    ) {
      issues.push({
        severity: "error",
        code: "INVALID_RESISTANCE",
        message: `${component.label}: la resistencia debe ser mayor que 0 Ω.`,
        componentIds: [component.id],
      });
    }

    if (
      component.type === "battery" &&
      (
        typeof component.properties.voltage !== "number" ||
        component.properties.voltage <= 0
      )
    ) {
      issues.push({
        severity: "warning",
        code: "INVALID_BATTERY_VOLTAGE",
        message: `${component.label}: revisá el valor de tensión de la batería.`,
        componentIds: [component.id],
      });
    }

    if (component.type === "led") {
      const forwardVoltage = component.properties.forwardVoltage;
      const maxCurrent = component.properties.maxCurrent;

      if (
        typeof forwardVoltage !== "number" ||
        forwardVoltage <= 0
      ) {
        issues.push({
          severity: "error",
          code: "INVALID_LED_VOLTAGE",
          message: `${component.label}: la tensión directa del LED debe ser mayor que 0 V.`,
          componentIds: [component.id],
        });
      }

      if (
        typeof maxCurrent !== "number" ||
        maxCurrent <= 0
      ) {
        issues.push({
          severity: "error",
          code: "INVALID_LED_CURRENT",
          message: `${component.label}: la corriente máxima debe ser mayor que 0 mA.`,
          componentIds: [component.id],
        });
      }
    }
  }

  // 3. Comprobar cables, componentes y terminales.
  const wireIds = new Set<string>();
  const connectedTerminals = new Set<string>();
  const connectionKeys = new Set<string>();

  for (const wire of circuit.wires) {
    if (wireIds.has(wire.id)) {
      issues.push({
        severity: "error",
        code: "DUPLICATE_WIRE_ID",
        message: `El ID del cable "${wire.id}" está repetido.`,
        wireIds: [wire.id],
      });
    }

    wireIds.add(wire.id);

    const endpoints = [
      `${wire.from.componentId}:${wire.from.terminalId}`,
      `${wire.to.componentId}:${wire.to.terminalId}`,
    ].sort();
    const connectionKey = endpoints.join("<->");
    if (connectionKeys.has(connectionKey)) {
      issues.push({
        severity: "error",
        code: "DUPLICATE_CONNECTION",
        message: `El cable "${wire.id}" duplica una conexión existente.`,
        wireIds: [wire.id],
      });
    }
    connectionKeys.add(connectionKey);

    if ((wire.points ?? []).some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
      issues.push({
        severity: "error",
        code: "INVALID_WIRE_POINT",
        message: `El cable "${wire.id}" contiene un punto de quiebre con coordenadas inválidas.`,
        wireIds: [wire.id],
      });
    }

    const fromComponent = circuit.components.find(
      (component) =>
        component.id === wire.from.componentId,
    );

    const toComponent = circuit.components.find(
      (component) =>
        component.id === wire.to.componentId,
    );

    if (!fromComponent || !toComponent) {
      issues.push({
        severity: "error",
        code: "MISSING_COMPONENT",
        message: `El cable "${wire.id}" apunta a un componente inexistente.`,
        wireIds: [wire.id],
      });

      continue;
    }

    const fromTerminal = fromComponent.terminals.find(
      (terminal) =>
        terminal.id === wire.from.terminalId,
    );

    const toTerminal = toComponent.terminals.find(
      (terminal) =>
        terminal.id === wire.to.terminalId,
    );

    if (!fromTerminal || !toTerminal) {
      issues.push({
        severity: "error",
        code: "MISSING_TERMINAL",
        message: `El cable "${wire.id}" apunta a un terminal inexistente.`,
        componentIds: [
          fromComponent.id,
          toComponent.id,
        ],
        wireIds: [wire.id],
      });

      continue;
    }

    if (
      wire.from.componentId === wire.to.componentId &&
      wire.from.terminalId === wire.to.terminalId
    ) {
      issues.push({
        severity: "error",
        code: "SELF_CONNECTION",
        message: `El cable "${wire.id}" conecta un terminal consigo mismo.`,
        componentIds: [fromComponent.id],
        wireIds: [wire.id],
      });
    }

    connectedTerminals.add(
      `${wire.from.componentId}:${wire.from.terminalId}`,
    );

    connectedTerminals.add(
      `${wire.to.componentId}:${wire.to.terminalId}`,
    );
  }

  // 4. Detectar terminales individuales sin conexión (no solo componentes aislados).
  // En componentes de dos terminales esto es un error de circuito incompleto;
  // en componentes multipin puede ser intencional y se informa como advertencia.
  for (const component of circuit.components) {
    for (const terminal of component.terminals) {
      if (connectedTerminals.has(`${component.id}:${terminal.id}`)) continue;
      // A relay's normally-open/normally-closed contacts may intentionally be unused.
      // Its coil is still required to be connected by the transient solver.
      if (component.type === "relay" && ["common", "normally_open", "normally_closed"].includes(terminal.id)) continue;
      issues.push({
        severity: component.terminals.length === 2 ? "error" : "warning",
        code: "UNCONNECTED_TERMINAL",
        message: `${component.label}: el terminal «${terminal.name || terminal.id}» no está conectado a ningún cable.`,
        componentIds: [component.id],
      });
    }
  }

  // 5. Avisar sobre componentes sin ninguna conexión.
  for (const component of circuit.components) {
    const hasConnection = component.terminals.some(
      (terminal) =>
        connectedTerminals.has(
          `${component.id}:${terminal.id}`,
        ),
    );

    if (!hasConnection) {
      issues.push({
        severity: "warning",
        code: "UNCONNECTED_COMPONENT",
        message: `${component.label} no está conectado a ningún cable.`,
        componentIds: [component.id],
      });
    }
  }

  // 6. Reglas eléctricas preliminares para circuitos con batería, LED y resistencia.
  // Son heurísticas: no analizan nodos completos ni reemplazan una simulación.
  const batteries = circuit.components.filter((component) => component.type === "battery");
  const leds = circuit.components.filter((component) => component.type === "led");
  const resistors = circuit.components.filter((component) => component.type === "resistor");

  if (batteries.length > 0 && leds.length > 0 && resistors.length === 0) {
    issues.push({
      severity: "warning",
      code: "LED_WITHOUT_CURRENT_LIMITING_RESISTOR",
      message: "Hay una batería y un LED, pero no se encontró ninguna resistencia limitadora. Revisá la protección de corriente del LED.",
      componentIds: [...batteries.map((item) => item.id), ...leds.map((item) => item.id)],
    });
  }

  for (const battery of batteries) {
    const voltage = battery.properties.voltage;
    if (typeof voltage !== "number" || !Number.isFinite(voltage) || voltage <= 0) continue;

    for (const led of leds) {
      const forwardVoltage = led.properties.forwardVoltage;
      const maxCurrent = led.properties.maxCurrent;
      if (typeof forwardVoltage !== "number" || !Number.isFinite(forwardVoltage) || forwardVoltage < 0 ||
          typeof maxCurrent !== "number" || !Number.isFinite(maxCurrent) || maxCurrent <= 0) continue;

      // Estimación conservadora simple: asume que una sola resistencia está en serie.
      // No se afirma que la topología real del circuito cumpla ese supuesto.
      const candidateResistors = resistors.filter((item) => {
        const value = item.properties.resistance;
        return typeof value === "number" && Number.isFinite(value) && value > 0;
      });

      if (candidateResistors.length === 1) {
        const resistance = candidateResistors[0].properties.resistance as number;
        const estimatedCurrentMa = Math.max(0, (voltage - forwardVoltage) / resistance * 1000);
        if (estimatedCurrentMa > maxCurrent) {
          issues.push({
            severity: "warning",
            code: "ESTIMATED_LED_OVERCURRENT",
            message: `${led.label}: estimación simplificada de ${estimatedCurrentMa.toFixed(1)} mA con una resistencia de ${resistance} Ω; supera el máximo declarado de ${maxCurrent} mA. Revisá los valores y la conexión real.`,
            componentIds: [battery.id, candidateResistors[0].id, led.id],
          });
        }
      }

      // Detecta solo conexiones directas a terminales de polaridad opuesta.
      const directReverseConnection = circuit.wires.some((wire) =>
        (wire.from.componentId === battery.id && wire.from.terminalId === "positive" &&
          wire.to.componentId === led.id && wire.to.terminalId === "cathode") ||
        (wire.to.componentId === battery.id && wire.to.terminalId === "positive" &&
          wire.from.componentId === led.id && wire.from.terminalId === "cathode") ||
        (wire.from.componentId === battery.id && wire.from.terminalId === "negative" &&
          wire.to.componentId === led.id && wire.to.terminalId === "anode") ||
        (wire.to.componentId === battery.id && wire.to.terminalId === "negative" &&
          wire.from.componentId === led.id && wire.from.terminalId === "anode")
      );
      if (directReverseConnection) {
        issues.push({
          severity: "warning",
          code: "POSSIBLE_REVERSED_LED_POLARITY",
          message: `${led.label}: una conexión directa parece aplicar polaridad inversa al LED. Verificá el circuito completo.`,
          componentIds: [battery.id, led.id],
        });
      }
    }
  }

  return issues;
}
