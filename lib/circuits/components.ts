import type { ComponentType, CircuitComponent, Terminal } from "./types";

type ComponentDefinition = {
  type: ComponentType;
  label: string;
  properties: Record<string, string | number | boolean>;
  terminals: Terminal[];
};
const t = (id: string, name: string, x: number, y = 0): Terminal => ({ id, name, position: { x, y } });
const pair = (left = "A", right = "B") => [t("a", left, -28), t("b", right, 28)];
const polarized = (positive = "＋", negative = "−") => [t("positive", positive, -28), t("negative", negative, 28)];
const definitions: Record<ComponentType, ComponentDefinition> = {
  battery: { type:"battery", label:"BAT1", properties:{ voltage:9, description:"Fuente de tensión continua" }, terminals:polarized("+", "−") },
  resistor: { type:"resistor", label:"R1", properties:{ resistance:220, tolerance:5, unit:"Ω" }, terminals:pair() },
  led: { type:"led", label:"D1", properties:{ color:"red", forwardVoltage:2, maxCurrent:20 }, terminals:[t("anode","Ánodo (+)",-28),t("cathode","Cátodo (−)",28)] },
  switch: { type:"switch", label:"SW1", properties:{ closed:false, description:"Interruptor simple" }, terminals:pair() },
  ground: { type:"ground", label:"GND1", properties:{ description:"Referencia de potencial" }, terminals:[t("gnd","GND",0,-17)] },
  diode: { type:"diode", label:"D1", properties:{ forwardVoltage:0.7 }, terminals:[t("anode","Ánodo (+)",-28),t("cathode","Cátodo (−)",28)] },
  capacitor: { type:"capacitor", label:"C1", properties:{ capacitance:100, unit:"nF" }, terminals:pair() },
  polarized_capacitor: { type:"polarized_capacitor", label:"C1", properties:{ capacitance:10, unit:"µF" }, terminals:polarized("+","−") },
  inductor: { type:"inductor", label:"L1", properties:{ inductance:10, unit:"mH" }, terminals:pair() },
  npn_transistor: { type:"npn_transistor", label:"Q1", properties:{ description:"Transistor NPN" }, terminals:[t("base","Base",0,-22),t("collector","Colector",25,-5),t("emitter","Emisor",25,18)] },
  pnp_transistor: { type:"pnp_transistor", label:"Q1", properties:{ description:"Transistor PNP" }, terminals:[t("base","Base",0,-22),t("collector","Colector",25,-5),t("emitter","Emisor (+)",25,18)] },
  mosfet_n: { type:"mosfet_n", label:"Q1", properties:{ description:"MOSFET canal N" }, terminals:[t("gate","Puerta (G)",-25,0),t("drain","Drenador (D)",25,-14),t("source","Fuente (S)",25,14)] },
  mosfet_p: { type:"mosfet_p", label:"Q1", properties:{ description:"MOSFET canal P" }, terminals:[t("gate","Puerta (G)",-25,0),t("drain","Drenador (D)",25,-14),t("source","Fuente (S)",25,14)] },
  op_amp: { type:"op_amp", label:"U1", properties:{ description:"Amplificador operacional" }, terminals:[t("inverting","Entrada −",-25,-12),t("non_inverting","Entrada +",-25,12),t("output","Salida",25,0),t("vcc","V+ (alimentación)",0,-25),t("vee","V− (alimentación)",0,25)] },
  voltage_source_ac: { type:"voltage_source_ac", label:"VAC1", properties:{ voltage:5, frequency:50, unit:"V RMS" }, terminals:polarized("＋","−") },
  current_source: { type:"current_source", label:"I1", properties:{ current:0.01, unit:"A" }, terminals:pair("＋","−") },
  fuse: { type:"fuse", label:"F1", properties:{ currentRating:1, unit:"A" }, terminals:pair() },
  motor: { type:"motor", label:"M1", properties:{ voltage:6 }, terminals:polarized("+","−") },
  lamp: { type:"lamp", label:"LP1", properties:{ voltage:6 }, terminals:pair() },
  push_button: { type:"push_button", label:"PB1", properties:{ normallyOpen:true }, terminals:pair() },
  relay: { type:"relay", label:"K1", properties:{ coilVoltage:5 }, terminals:[t("coil1","Bobina 1",-28,-8),t("coil2","Bobina 2",-28,8),t("common","Común",28,-14),t("normally_open","NA",28,0),t("normally_closed","NC",28,14)] },
  photodiode: { type:"photodiode", label:"PD1", properties:{ description:"Fotodiodo" }, terminals:[t("anode","Ánodo (+)",-28),t("cathode","Cátodo (−)",28)] },
  ldr: { type:"ldr", label:"LDR1", properties:{ resistance:10000, unit:"Ω" }, terminals:pair() },
  thermistor: { type:"thermistor", label:"TH1", properties:{ resistance:10000, unit:"Ω" }, terminals:pair() },
  potentiometer: { type:"potentiometer", label:"RV1", properties:{ resistance:10000, unit:"Ω" }, terminals:[t("a","Extremo A",-28,-12),t("wiper","Cursor",28,0),t("b","Extremo B",-28,12)] },
  zener_diode: { type:"zener_diode", label:"DZ1", properties:{ zenerVoltage:5.1, unit:"V" }, terminals:[t("anode","Ánodo (+)",-28),t("cathode","Cátodo (−)",28)] },
  logic_gate_and: { type:"logic_gate_and", label:"U1", properties:{ description:"Puerta lógica AND" }, terminals:[t("a","A",-25,-12),t("b","B",-25,12),t("y","Y",25,0)] },
  logic_gate_or: { type:"logic_gate_or", label:"U1", properties:{ description:"Puerta lógica OR" }, terminals:[t("a","A",-25,-12),t("b","B",-25,12),t("y","Y",25,0)] },
  logic_gate_not: { type:"logic_gate_not", label:"U1", properties:{ description:"Puerta lógica NOT" }, terminals:[t("a","Entrada",-25,0),t("y","Salida",25,0)] },
  ic_555: { type:"ic_555", label:"U1", properties:{ description:"Temporizador NE555" }, terminals:[t("gnd","GND",-25,20),t("trigger","TRIG",-25,12),t("output","OUT",25,0),t("reset","RESET",-25,-12),t("vcc","VCC",-25,-20),t("threshold","THR",25,-20),t("discharge","DISCH",25,-12),t("control","CTRL",25,20)] },
  ic_4017: { type:"ic_4017", label:"U1", properties:{ description:"Contador decimal CD4017" }, terminals:[t("vss","VSS",-25,20),t("clock","CLK",-25,0),t("reset","RESET",-25,-12),t("enable","EN",-25,12),t("vdd","VDD",-25,-20),t("q0","Q0",25,-20),t("q1","Q1",25,-12),t("q2","Q2",25,-4),t("q3","Q3",25,4),t("q4","Q4",25,12),t("q5","Q5",25,20)] },
  connector: { type:"connector", label:"J1", properties:{ pins:2 }, terminals:[t("pin1","Pin 1",-15,-8),t("pin2","Pin 2",-15,8)] },
};
export function getComponentDefinition(type: ComponentType): ComponentDefinition {
  const definition = definitions[type];
  return { ...definition, properties:{...definition.properties}, terminals:definition.terminals.map((terminal)=>({...terminal,position:{...terminal.position}})) };
}
export function createComponent(type: ComponentType, id: string, x=100, y=100): CircuitComponent {
  const definition=getComponentDefinition(type);
  return { id, type, label:definition.label, position:{x,y}, rotation:0, properties:definition.properties, terminals:definition.terminals };
}
export function getAvailableComponentTypes(): ComponentType[] { return Object.keys(definitions) as ComponentType[]; }
