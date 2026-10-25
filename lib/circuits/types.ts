
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
  | "connector"
  | "cell"
  | "ground_earth"
  | "voltage_rail"
  | "variable_voltage_input"
  | "voltage_source_dc"
  | "voltage_regulator"
  | "rail"
  | "terminal_block"
  | "sil_socket"
  | "dil_socket"
  | "push_to_break"
  | "switch_spst"
  | "switch_spdt"
  | "switch_dpst"
  | "switch_dpdt"
  | "phototransistor"
  | "opto_isolator"
  | "crystal_oscillator"
  | "resistor_pack"
  | "transformer"
  | "bridge_rectifier"
  | "jfet_n"
  | "jfet_p"
  | "thyristor_scr"
  | "triac"
  | "logic_gate_nand"
  | "logic_gate_nor"
  | "logic_gate_xor"
  | "logic_gate_xnor"
  | "logic_gate_buffer"
  | "decoder_counter"
  | "bicolor_led"
  | "seven_segment"
  | "buzzer"
  | "multimeter"
  | "voltmeter"
  | "ammeter"
  | "oscilloscope"
  | "logic_analyzer"
  | "word_generator"
  | "text_label";

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
