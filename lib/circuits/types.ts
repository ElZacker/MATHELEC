
export type ComponentType =
  | "battery"
  | "resistor"
  | "led"
  | "switch"
  | "ground"
  | "diode"
  | "capacitor"
  | "polarized_capacitor"
  | "inductor"
  | "npn_transistor"
  | "pnp_transistor"
  | "mosfet_n"
  | "mosfet_p"
  | "op_amp"
  | "voltage_source_ac"
  | "current_source"
  | "fuse"
  | "motor"
  | "lamp"
  | "push_button"
  | "relay"
  | "photodiode"
  | "ldr"
  | "thermistor"
  | "potentiometer"
  | "zener_diode"
  | "logic_gate_and"
  | "logic_gate_or"
  | "logic_gate_not"
  | "ic_555"
  | "ic_4017"
  | "connector";

export type Point = {
  x: number;
  y: number;
};

export type Terminal = {
  id: string;
  name: string;
  position: Point;
};

export type CircuitComponent = {
  id: string;
  type: ComponentType;
  label: string;
  position: Point;
  rotation: 0 | 90 | 180 | 270;
  properties: Record<string, string | number | boolean>;
  terminals: Terminal[];
};

export type CircuitWire = {
  id: string;
  from: {
    componentId: string;
    terminalId: string;
  };
  to: {
    componentId: string;
    terminalId: string;
  };
  /** Puntos intermedios opcionales para definir los quiebres del cable. */
  points?: Point[];
};

export type Circuit = {
  id: string;
  name: string;
  version: 1;
  components: CircuitComponent[];
  wires: CircuitWire[];
  createdAt: string;
  updatedAt: string;
};

export type ValidationSeverity = "error" | "warning" | "info";

export type ValidationIssue = {
  severity: ValidationSeverity;
  code: string;
  message: string;
  componentIds?: string[];
  wireIds?: string[];
};
