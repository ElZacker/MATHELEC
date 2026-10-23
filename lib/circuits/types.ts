
export type ComponentType =
  | "battery"
  | "resistor"
  | "led"
  | "switch"
  | "ground";

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
