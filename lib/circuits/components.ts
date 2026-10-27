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
  npn_transistor: { type:"npn_transistor", label:"Q1", properties:{ description:"Transistor NPN", beta:100, saturationCurrent:1e-14, vceSaturation:0.2 }, terminals:[t("base","Base",0,-22),t("collector","Colector",25,-5),t("emitter","Emisor",25,18)] },
  pnp_transistor: { type:"pnp_transistor", label:"Q1", properties:{ description:"Transistor PNP", beta:100, saturationCurrent:1e-14, vceSaturation:0.2 }, terminals:[t("base","Base",0,-22),t("collector","Colector",25,-5),t("emitter","Emisor (+)",25,18)] },
  mosfet_n: { type:"mosfet_n", label:"Q1", properties:{ description:"MOSFET canal N" }, terminals:[t("gate","Puerta (G)",-25,0),t("drain","Drenador (D)",25,-14),t("source","Fuente (S)",25,14)] },
  mosfet_p: { type:"mosfet_p", label:"Q1", properties:{ description:"MOSFET canal P" }, terminals:[t("gate","Puerta (G)",-25,0),t("drain","Drenador (D)",25,-14),t("source","Fuente (S)",25,14)] },
  op_amp: { type:"op_amp", label:"U1", properties:{ description:"Amplificador operacional" }, terminals:[t("inverting","Entrada −",-25,-12),t("non_inverting","Entrada +",-25,12),t("output","Salida",25,0),t("vcc","V+ (alimentación)",0,-25),t("vee","V− (alimentación)",0,25)] },
  voltage_source_ac: { type:"voltage_source_ac", label:"VAC1", properties:{ voltage:5, frequency:50, unit:"V RMS" }, terminals:polarized("＋","−") },
  current_source: { type:"current_source", label:"I1", properties:{ current:0.01, unit:"A" }, terminals:pair("＋","−") },
  fuse: { type:"fuse", label:"F1", properties:{ currentRating:1, unit:"A" }, terminals:pair() },
  motor: { type:"motor", label:"M1", properties:{ voltage:6, resistance:12, inductance:20, inductanceUnit:"mH", mechanicalTimeConstantMs:250 }, terminals:polarized("+","−") },
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
  cell: { type:"cell", label:"BAT1", properties:{ voltage:1.5, description:"Celda electroquímica" }, terminals:polarized("+","−") },
  ground_earth: { type:"ground_earth", label:"PE1", properties:{ description:"Tierra de protección" }, terminals:[t("earth","PE",0,-17)] },
  voltage_rail: { type:"voltage_rail", label:"VCC1", properties:{ voltage:5 }, terminals:[t("rail","V+",0,0)] },
  variable_voltage_input: { type:"variable_voltage_input", label:"VIN1", properties:{ minVoltage:0, maxVoltage:12, voltage:5, unit:"V" }, terminals:polarized("+","−") },
  voltage_source_dc: { type:"voltage_source_dc", label:"VDC1", properties:{ voltage:5, unit:"V" }, terminals:polarized("+","−") },
  voltage_regulator: { type:"voltage_regulator", label:"U1", properties:{ outputVoltage:5, family:"78xx" }, terminals:[t("input","IN",-28,-10),t("ground","GND",0,18),t("output","OUT",28,-10)] },
  rail: { type:"rail", label:"J1", properties:{ pins:4 }, terminals:[t("pin1","Pin 1",-15,-12),t("pin2","Pin 2",-15,-4),t("pin3","Pin 3",-15,4),t("pin4","Pin 4",-15,12)] },
  terminal_block: { type:"terminal_block", label:"X1", properties:{ pins:2 }, terminals:[t("pin1","Pin 1",-15,-8),t("pin2","Pin 2",-15,8)] },
  sil_socket: { type:"sil_socket", label:"J1", properties:{ pins:4, rows:1 }, terminals:[t("pin1","Pin 1",-15,-12),t("pin2","Pin 2",-15,-4),t("pin3","Pin 3",-15,4),t("pin4","Pin 4",-15,12)] },
  dil_socket: { type:"dil_socket", label:"U1", properties:{ pins:8, rows:2 }, terminals:[t("pin1","Pin 1",-18,-18),t("pin2","Pin 2",-18,-6),t("pin3","Pin 3",-18,6),t("pin4","Pin 4",-18,18),t("pin5","Pin 5",18,18),t("pin6","Pin 6",18,6),t("pin7","Pin 7",18,-6),t("pin8","Pin 8",18,-18)] },
  push_to_break: { type:"push_to_break", label:"PB1", properties:{ normallyClosed:true }, terminals:pair() },
  switch_spst: { type:"switch_spst", label:"SW1", properties:{ poles:1, throws:1, closed:false }, terminals:pair() },
  switch_spdt: { type:"switch_spdt", label:"SW1", properties:{ poles:1, throws:2, closed:false }, terminals:[t("common","Común",-28,0),t("throw1","NA",28,-12),t("throw2","NC",28,12)] },
  switch_dpst: { type:"switch_dpst", label:"SW1", properties:{ poles:2, throws:1, closed:false }, terminals:[t("a1","A1",-28,-12),t("a2","A2",28,-12),t("b1","B1",-28,12),t("b2","B2",28,12)] },
  switch_dpdt: { type:"switch_dpdt", label:"SW1", properties:{ poles:2, throws:2, closed:false }, terminals:[t("common1","C1",-28,-12),t("throw1a","1A",28,-20),t("throw1b","1B",28,-4),t("common2","C2",-28,12),t("throw2a","2A",28,4),t("throw2b","2B",28,20)] },
  phototransistor: { type:"phototransistor", label:"Q1", properties:{ description:"Fototransistor NPN" }, terminals:[t("collector","Colector",18,-15),t("emitter","Emisor",18,15)] },
  opto_isolator: { type:"opto_isolator", label:"U1", properties:{ description:"Optoacoplador" }, terminals:[t("anode","LED A",-28,-10),t("cathode","LED K",-28,10),t("collector","C",28,-10),t("emitter","E",28,10)] },
  crystal_oscillator: { type:"crystal_oscillator", label:"Y1", properties:{ frequency:32768, unit:"Hz" }, terminals:pair() },
  resistor_pack: { type:"resistor_pack", label:"RN1", properties:{ resistance:10000, resistors:4, unit:"Ω" }, terminals:[t("common","Común",-20,0),t("pin1","Pin 1",20,-15),t("pin2","Pin 2",20,-5),t("pin3","Pin 3",20,5),t("pin4","Pin 4",20,15)] },
  transformer: { type:"transformer", label:"T1", properties:{ primaryVoltage:230, secondaryVoltage:12, frequency:50, unit:"V" }, terminals:[t("primary1","Primario 1",-28,-12),t("primary2","Primario 2",-28,12),t("secondary1","Secundario 1",28,-12),t("secondary2","Secundario 2",28,12)] },
  bridge_rectifier: { type:"bridge_rectifier", label:"BR1", properties:{ maxCurrent:1, maxVoltage:100 }, terminals:[t("ac1","~1",-24,-12),t("ac2","~2",-24,12),t("positive","+ ",24,-12),t("negative","−",24,12)] },
  jfet_n: { type:"jfet_n", label:"Q1", properties:{ channel:"N" }, terminals:[t("gate","G",-25,0),t("drain","D",25,-14),t("source","S",25,14)] },
  jfet_p: { type:"jfet_p", label:"Q1", properties:{ channel:"P" }, terminals:[t("gate","G",-25,0),t("drain","D",25,-14),t("source","S",25,14)] },
  thyristor_scr: { type:"thyristor_scr", label:"SCR1", properties:{ maxCurrent:1, maxVoltage:400 }, terminals:[t("anode","A",-28,-12),t("cathode","K",28,12),t("gate","G",-28,12)] },
  triac: { type:"triac", label:"TRIAC1", properties:{ maxCurrent:1, maxVoltage:400 }, terminals:[t("mt1","MT1",-28,12),t("mt2","MT2",28,-12),t("gate","G",-28,-12)] },
  logic_gate_nand: { type:"logic_gate_nand", label:"U1", properties:{ description:"Puerta lógica NAND" }, terminals:[t("a","A",-25,-12),t("b","B",-25,12),t("y","Y",25,0)] },
  logic_gate_nor: { type:"logic_gate_nor", label:"U1", properties:{ description:"Puerta lógica NOR" }, terminals:[t("a","A",-25,-12),t("b","B",-25,12),t("y","Y",25,0)] },
  logic_gate_xor: { type:"logic_gate_xor", label:"U1", properties:{ description:"Puerta lógica XOR" }, terminals:[t("a","A",-25,-12),t("b","B",-25,12),t("y","Y",25,0)] },
  logic_gate_xnor: { type:"logic_gate_xnor", label:"U1", properties:{ description:"Puerta lógica XNOR" }, terminals:[t("a","A",-25,-12),t("b","B",-25,12),t("y","Y",25,0)] },
  logic_gate_buffer: { type:"logic_gate_buffer", label:"U1", properties:{ description:"Buffer lógico" }, terminals:[t("a","Entrada",-25,0),t("y","Salida",25,0)] },
  decoder_counter: { type:"decoder_counter", label:"U1", properties:{ description:"Decodificador / contador", pins:8 }, terminals:[t("in1","A",-25,-15),t("in2","B",-25,-5),t("in3","C",-25,5),t("in4","D",-25,15),t("out1","Q0",25,-15),t("out2","Q1",25,-5),t("out3","Q2",25,5),t("out4","Q3",25,15)] },
  bicolor_led: { type:"bicolor_led", label:"D1", properties:{ color1:"red", color2:"green", forwardVoltage:2 }, terminals:[t("anode1","Ánodo 1",-28,-10),t("cathode1","Cátodo 1",28,-10),t("anode2","Ánodo 2",-28,10),t("cathode2","Cátodo 2",28,10)] },
  seven_segment: { type:"seven_segment", label:"DISP1", properties:{ digits:1, common:"cathode" }, terminals:[t("a","a",-25,-18),t("b","b",25,-18),t("c","c",25,-6),t("d","d",25,18),t("e","e",-25,18),t("f","f",-25,-6),t("g","g",0,0),t("dp","dp",25,22)] },
  buzzer: { type:"buzzer", label:"BZ1", properties:{ voltage:5, frequency:2000 }, terminals:polarized("+","−") },
  multimeter: { type:"multimeter", label:"XMM1", properties:{ mode:"voltage", description:"Multímetro virtual; no calcula valores aún" }, terminals:[t("positive","+ ",-28,-10),t("negative","COM",28,10)] },
  voltmeter: { type:"voltmeter", label:"VM1", properties:{ range:20, unit:"V", description:"Instrumento visual; sin simulación eléctrica" }, terminals:polarized("+","−") },
  ammeter: { type:"ammeter", label:"AM1", properties:{ range:1, unit:"A", description:"Instrumento visual; sin simulación eléctrica" }, terminals:pair() },
  oscilloscope: { type:"oscilloscope", label:"XSC1", properties:{ channels:2, timebase:1, description:"Osciloscopio representativo; no mide señales en tiempo real todavía" }, terminals:[t("ch1","CH1",-28,-10),t("ch2","CH2",-28,10),t("ground","GND",28,0)] },
  logic_analyzer: { type:"logic_analyzer", label:"XLA1", properties:{ channels:8, description:"Analizador lógico visual; sin captura en tiempo real" }, terminals:[t("ch0","D0",-28,-18),t("ch1","D1",-28,-12),t("ch2","D2",-28,-6),t("ch3","D3",-28,0),t("ch4","D4",-28,6),t("ch5","D5",-28,12),t("ch6","D6",-28,18),t("ground","GND",28,0)] },
  word_generator: { type:"word_generator", label:"XWG1", properties:{ width:8, frequency:1000, description:"Generador lógico representativo; sin salida dinámica todavía" }, terminals:[t("clk","CLK",-28,0),t("d0","D0",28,-18),t("d1","D1",28,-12),t("d2","D2",28,-6),t("d3","D3",28,0),t("d4","D4",28,6),t("d5","D5",28,12),t("d6","D6",28,18)] },
  text_label: { type:"text_label", label:"TXT1", properties:{ text:"Nota", description:"Etiqueta documental, no eléctrica" }, terminals:[] },
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
