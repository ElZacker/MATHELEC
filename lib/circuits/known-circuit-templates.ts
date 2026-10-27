import { getComponentDefinition } from "./components";
import type { ComponentType } from "./types";

export type KnownCircuitComponent = {
  type: ComponentType;
  x: number;
  y: number;
  properties?: Record<string, string | number | boolean>;
};
export type KnownCircuitWire = {
  from: { componentIndex: number; terminalId: string };
  to: { componentIndex: number; terminalId: string };
};
export type KnownCircuitProposal = {
  title: string;
  explanation: string;
  response: string;
  components: KnownCircuitComponent[];
  wires: KnownCircuitWire[];
  confirmedRequirements: string[];
  assumptions: string[];
  missingInformation: string[];
  warnings: string[];
  actions?: Record<string, unknown>[];
};

export function buildKnownCircuitProposal(prompt: string): KnownCircuitProposal | null {
  const text = prompt.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(sin conexiones|sin conectar|sin cables|componentes sueltos|no conectes|no conectar)\b/.test(text)) return null;
  if (!/\b(circuito|circuit|arma|armar|crea|crear|genera|generar|disena|disenar|monta|construye|haceme|hace|quiero|necesito|dame|control de giro|detector de mentiras|poligrafo|detector de proximidad|sensor de proximidad|base comun|led intermitente|secuenciador de leds)\b/.test(text)) return null;
  type C = KnownCircuitComponent; type W = KnownCircuitWire;
  const cpt = (type: ComponentType, x: number, y: number, properties?: Record<string, string | number | boolean>): C => ({ type, x, y, ...(properties ? { properties } : {}) });
  const w = (fromIndex: number, fromTerminal: string, toIndex: number, toTerminal: string): W => ({ from:{componentIndex:fromIndex,terminalId:fromTerminal},to:{componentIndex:toIndex,terminalId:toTerminal} });
  const result = (title:string, explanation:string, response:string, components:C[], wires:W[], confirmedRequirements:string[], assumptions:string[], warnings:string[], missingInformation:string[]=[]):KnownCircuitProposal => {
    if (components.length > 30 || wires.length > 40) throw new Error("La plantilla excede el límite de componentes o cables.");
    const validTerminals = components.map((item) => getComponentDefinition(item.type).terminals.map((terminal) => terminal.id));
    const connected = new Set<string>();
    const wireKeys = new Set<string>();
    for (const wire of wires) {
      if (!components[wire.from.componentIndex] || !components[wire.to.componentIndex]) throw new Error("La plantilla contiene una conexión a un componente inexistente.");
      if (!validTerminals[wire.from.componentIndex].includes(wire.from.terminalId) || !validTerminals[wire.to.componentIndex].includes(wire.to.terminalId)) {
        throw new Error("La plantilla contiene una conexión a un terminal inexistente.");
      }
      const ends = [
        wire.from.componentIndex + ":" + wire.from.terminalId,
        wire.to.componentIndex + ":" + wire.to.terminalId,
      ];
      if (ends[0] === ends[1]) throw new Error("La plantilla intenta conectar un terminal consigo mismo.");
      const wireKey = [...ends].sort().join("<->");
      if (wireKeys.has(wireKey)) throw new Error("La plantilla contiene una conexión duplicada.");
      wireKeys.add(wireKey);
      connected.add(ends[0]); connected.add(ends[1]);
    }
    const openTerminals = components.flatMap((item,index) =>
      getComponentDefinition(item.type).terminals
        .filter((terminal) => !connected.has(index + ":" + terminal.id))
        .map((terminal) => item.type + " #" + (index + 1) + " terminal " + (terminal.name || terminal.id)));
    if (openTerminals.length) throw new Error("La plantilla no se aplicó porque tiene terminales sin cable: " + openTerminals.join(", ") + ".");
    return {title,explanation,response,components,wires,confirmedRequirements,assumptions,warnings,missingInformation,actions:[]};
  };

  // Reliable template for the common 555 astable: 9 V, 10 kΩ, 47 kΩ, 22 µF, LED+390 Ω.
  if ((/\b(ne ?555|ic ?555|555)\b/.test(text) || /\bled intermitente\b/.test(text)) && /\b(parpade|intermit|titil|blink|destell|oscilador|led)\w*/.test(text)) {
    const components:C[]=[
      cpt("battery",55,170,{voltage:9}),cpt("ic_555",245,150),
      cpt("resistor",125,65,{resistance:10000,tolerance:5,unit:"Ω"}),
      cpt("resistor",185,65,{resistance:47000,tolerance:5,unit:"Ω"}),
      cpt("capacitor",170,250,{capacitance:22,unit:"µF"}),
      cpt("resistor",355,75,{resistance:390,tolerance:5,unit:"Ω"}),
      cpt("led",380,155,{color:"red",forwardVoltage:2,maxCurrent:20}),cpt("ground",330,260)];
    const wires:W[]=[
      w(0,"positive",1,"vcc"),w(0,"negative",1,"gnd"),w(0,"positive",1,"reset"),
      w(0,"positive",2,"a"),w(2,"b",1,"discharge"),w(1,"discharge",3,"a"),
      w(3,"b",1,"threshold"),w(1,"threshold",1,"trigger"),w(1,"threshold",4,"a"),
      w(4,"b",0,"negative"),w(1,"control",7,"gnd"),w(7,"gnd",0,"negative"),
      w(1,"output",5,"a"),w(5,"b",6,"anode"),w(6,"cathode",0,"negative")];
    return result("LED intermitente con NE555","Astable clásico: R1=10 kΩ, R2=47 kΩ y C1=22 µF. La salida conmuta; R3 limita la corriente del LED.",
      "Listo: armé el astable con NE555 y conecté sus patas funcionales. El LED debería encenderse y apagarse periódicamente en una simulación temporal.",
      components,wires,["NE555 astable","LED intermitente","Resistencia limitadora","Conexiones principales completas"],
      ["Alimentación de 9 V","R1=10 kΩ, R2=47 kΩ, C1=22 µF, R3=390 Ω","Frecuencia aproximada de 0,63 Hz"],
      ["Modelo funcional idealizado del NE555; no es una macro SPICE del fabricante."]);
  }

  if (/\b(cd ?4017|ic ?4017|contador decimal|secuenciador de leds|luces secuenciales|leds secuenciales)\b/.test(text)) {
    const components:C[]=[
      cpt("voltage_source_dc",45,165,{voltage:5,unit:"V"}),cpt("ic_555",145,145),
      cpt("resistor",90,65,{resistance:10000,unit:"Ω"}),cpt("resistor",140,65,{resistance:47000,unit:"Ω"}),
      cpt("capacitor",95,245,{capacitance:22,unit:"µF"}),cpt("ic_4017",235,150),
      cpt("resistor",320,55,{resistance:390,unit:"Ω"}),cpt("led",375,55,{color:"red",forwardVoltage:2,maxCurrent:20}),
      cpt("resistor",320,95,{resistance:390,unit:"Ω"}),cpt("led",375,95,{color:"green",forwardVoltage:2,maxCurrent:20}),
      cpt("resistor",320,135,{resistance:390,unit:"Ω"}),cpt("led",375,135,{color:"blue",forwardVoltage:3,maxCurrent:20}),
      cpt("resistor",320,175,{resistance:390,unit:"Ω"}),cpt("led",375,175,{color:"red",forwardVoltage:2,maxCurrent:20}),
      cpt("resistor",320,215,{resistance:390,unit:"Ω"}),cpt("led",375,215,{color:"green",forwardVoltage:2,maxCurrent:20}),
      cpt("resistor",320,255,{resistance:390,unit:"Ω"}),cpt("led",375,255,{color:"blue",forwardVoltage:3,maxCurrent:20})];
    const wires:W[]=[
      w(0,"positive",1,"vcc"),w(0,"negative",1,"gnd"),w(0,"positive",1,"reset"),
      w(0,"positive",2,"a"),w(2,"b",1,"discharge"),w(1,"discharge",3,"a"),w(3,"b",1,"threshold"),
      w(1,"threshold",1,"trigger"),w(1,"threshold",4,"a"),w(4,"b",0,"negative"),w(1,"control",0,"negative"),
      w(0,"positive",5,"vdd"),w(0,"negative",5,"vss"),w(0,"negative",5,"enable"),w(0,"negative",5,"reset"),w(1,"output",5,"clock"),
      w(5,"q0",6,"a"),w(6,"b",7,"anode"),w(7,"cathode",0,"negative"),
      w(5,"q1",8,"a"),w(8,"b",9,"anode"),w(9,"cathode",0,"negative"),
      w(5,"q2",10,"a"),w(10,"b",11,"anode"),w(11,"cathode",0,"negative"),
      w(5,"q3",12,"a"),w(12,"b",13,"anode"),w(13,"cathode",0,"negative"),
      w(5,"q4",14,"a"),w(14,"b",15,"anode"),w(15,"cathode",0,"negative"),
      w(5,"q5",16,"a"),w(16,"b",17,"anode"),w(17,"cathode",0,"negative")];
    return result("Secuenciador de seis LED con NE555 + CD4017","El NE555 genera el reloj; el CD4017 activa Q0–Q5. Cada LED tiene su resistencia limitadora.",
      "Armé un secuenciador de seis pasos con NE555 y CD4017, con reloj, habilitación, reset, alimentación y las seis salidas conectadas.",
      components,wires,["NE555 como reloj","CD4017 con seis salidas","Seis LED con resistencias serie"],
      ["Alimentación de 5 V","Reloj aproximado de 0,63 Hz","Reset fijado a nivel bajo"],
      ["Modelo temporal idealizado; no representa retardos de propagación ni consumo real."]);
  }

  // Simple LED request must never fail because the model omitted its wires.
  if (/\bled\b/.test(text) && /\b(prenda|prender|encend|ilumin|enciend|funcione|que prenda)\w*/.test(text) && !/\b(555|intermit|parpade|titil)\b/.test(text)) {
    const components:C[]=[cpt("battery",65,165,{voltage:9}),cpt("resistor",220,95,{resistance:390,tolerance:5,unit:"Ω"}),cpt("led",355,165,{color:"red",forwardVoltage:2,maxCurrent:20})];
    return result("Circuito LED básico","Lazo DC en serie con fuente, resistencia limitadora y LED polarizado.",
      "Hecho: generé un circuito con batería de 9 V, resistencia de 390 Ω y LED. La corriente ideal estimada es de unos 18 mA, por debajo del máximo declarado de 20 mA.",
      components,[w(0,"positive",1,"a"),w(1,"b",2,"anode"),w(2,"cathode",0,"negative")],
      ["LED protegido por resistencia","Lazo cerrado"],["Fuente de 9 V","LED rojo ideal de 2 V"],["No incluye tolerancias ni variación térmica."]);
  }

  // GSR/biofeedback illustration; explicitly does not infer truthfulness.
  if (/\b(detector de mentiras|poligrafo|poligrafo casero)\b/.test(text)) {
    const components:C[]=[
      cpt("battery",55,165,{voltage:9}),cpt("op_amp",240,150),
      cpt("resistor",125,70,{resistance:100000,unit:"Ω"}),
      cpt("potentiometer",125,155,{resistance:100000,unit:"Ω"}),
      cpt("resistor",125,225,{resistance:100000,unit:"Ω"}),
      cpt("resistor",185,225,{resistance:100000,unit:"Ω"}),
      cpt("resistor",355,80,{resistance:390,unit:"Ω"}),
      cpt("led",380,160,{color:"red",forwardVoltage:2,maxCurrent:20}),cpt("ground",330,260)];
    const wires:W[]=[
      w(0,"positive",1,"vcc"),w(0,"negative",1,"vee"),
      w(0,"positive",2,"a"),w(2,"b",3,"a"),w(2,"b",1,"non_inverting"),w(2,"b",3,"wiper"),w(3,"b",0,"negative"),
      w(0,"positive",4,"a"),w(4,"b",1,"inverting"),w(4,"b",5,"a"),w(5,"b",0,"negative"),
      w(1,"output",6,"a"),w(6,"b",7,"anode"),w(7,"cathode",0,"negative"),w(8,"gnd",0,"negative")];
    return result("Indicador experimental de conductancia de la piel","Una resistencia variable modifica la tensión de entrada; un operacional la compara con un umbral y activa el LED.",
      "Generé una base de biofeedback por conductancia de la piel (GSR). No es un detector fiable de mentiras: la conductancia también cambia por sudoración, temperatura, movimiento y muchas otras causas, y no permite decidir si alguien miente.",
      components,wires,["Entrada resistiva ajustable","Comparación de umbral","LED indicador"],
      ["La resistencia variable representa de forma conceptual un sensor GSR","Operacional genérico con alimentación simple"],
      ["Para hardware real hacen falta electrodos aislados, excitación segura, acondicionamiento y calibración. El operacional genérico todavía no tiene modelo analógico completo."],
      ["No determina veracidad ni detecta mentiras; ilustra variaciones resistivas."]);
  }

  if (/\b(detector de proximidad|sensor de proximidad|proximidad)\b/.test(text)) {
    const components:C[]=[
      cpt("battery",50,165,{voltage:5}),cpt("resistor",115,75,{resistance:220,unit:"Ω"}),
      cpt("led",185,75,{color:"red",forwardVoltage:1.2,maxCurrent:30}),cpt("phototransistor",185,235),
      cpt("resistor",265,75,{resistance:10000,unit:"Ω"}),cpt("npn_transistor",300,175),
      cpt("resistor",370,75,{resistance:390,unit:"Ω"}),cpt("led",390,165,{color:"green",forwardVoltage:2,maxCurrent:20}),
      cpt("resistor",235,235,{resistance:10000,unit:"Ω"})];
    const wires:W[]=[
      w(0,"positive",1,"a"),w(1,"b",2,"anode"),w(2,"cathode",0,"negative"),
      w(0,"positive",4,"a"),w(4,"b",3,"collector"),w(3,"emitter",8,"a"),w(8,"b",5,"base"),
      w(0,"negative",5,"emitter"),w(0,"positive",6,"a"),w(6,"b",7,"anode"),w(7,"cathode",5,"collector")];
    return result("Indicador de proximidad infrarroja","Emisor IR, fototransistor receptor y etapa NPN de salida con LED indicador.",
      "Armé un esquema de proximidad infrarroja con emisor, fototransistor y transistor de salida. La distancia real depende de la luz reflejada, la alineación y la superficie; no se calibra con el modelo eléctrico actual.",
      components,wires,["Emisor IR con resistencia serie","Fototransistor receptor","Etapa NPN","LED indicador"],
      ["Fuente de 5 V","La señal óptica depende del entorno"],["No se modela la propagación ni reflexión de la luz."]);
  }

  if (/\b(control de giro|invertir (el )?giro|reversor de giro|inversor de giro|cambiar el sentido de giro|sentido de giro del motor)\b/.test(text)) {
    const components:C[]=[cpt("battery",65,165,{voltage:6}),cpt("switch_dpdt",220,165,{closed:true}),cpt("motor",360,165,{voltage:6})];
    return result("Inversor de giro de motor DC con DPDT","El DPDT invierte la polaridad aplicada a los bornes del motor.",
      "Generé un circuito de inversión de giro con DPDT. Al cambiar de posición, se invierte la polaridad del motor; la velocidad y el par todavía no se simulan.",
      components,[w(0,"positive",1,"throw1a"),w(0,"negative",1,"throw1b"),w(0,"negative",1,"throw2a"),w(0,"positive",1,"throw2b"),w(1,"common1",2,"positive"),w(1,"common2",2,"negative")],
      ["Motor DC","Inversión de polaridad DPDT"],["Fuente y motor de 6 V","DPDT debe soportar la corriente de arranque"],
      ["Todavía no hay modelo dinámico de motor ni de los contactos DPDT."]);
  }

  if (/\b(amplificador (de )?base comun|base comun)\b/.test(text)) {
    const components:C[]=[
      cpt("battery",55,165,{voltage:9}),cpt("voltage_source_ac",55,250,{voltage:0.05,frequency:1000,unit:"V peak"}),
      cpt("npn_transistor",245,155),cpt("resistor",150,55,{resistance:47000,unit:"Ω"}),
      cpt("resistor",150,235,{resistance:10000,unit:"Ω"}),cpt("resistor",325,60,{resistance:4700,unit:"Ω"}),
      cpt("resistor",325,245,{resistance:1000,unit:"Ω"}),cpt("capacitor",135,270,{capacitance:10,unit:"µF"}),
      cpt("capacitor",365,125,{capacitance:10,unit:"µF"}),cpt("capacitor",240,245,{capacitance:100,unit:"µF"}),
      cpt("resistor",390,245,{resistance:10000,unit:"Ω"}),cpt("ground",75,295)];
    const wires:W[]=[
      w(0,"positive",3,"a"),w(3,"b",2,"base"),w(3,"b",4,"a"),w(4,"b",0,"negative"),
      w(5,"a",0,"positive"),w(5,"b",2,"collector"),w(6,"a",2,"emitter"),w(6,"b",0,"negative"),
      w(1,"positive",7,"a"),w(1,"negative",0,"negative"),w(7,"b",2,"emitter"),
      w(9,"a",2,"base"),w(9,"b",11,"gnd"),w(11,"gnd",0,"negative"),
      w(8,"a",2,"collector"),w(8,"b",10,"a"),w(10,"b",0,"negative")];
    return result("Amplificador BJT de base común","Divisor R1/R2, RC en colector, RE en emisor, bypass de base y capacitores de acople.",
      "Armé una topología NPN de base común, con entrada por emisor y salida por colector. La ganancia y el punto de operación requieren un modelo BJT y análisis AC.",
      components,wires,["Etapa NPN de base común","Polarización DC","Acople de entrada/salida","Bypass de base"],
      ["Fuente de 9 V","Entrada de 50 mV pico a 1 kHz","Valores iniciales didácticos"],
      ["No hay todavía modelo Gummel-Poon ni análisis de pequeña señal; no se inventan valores de ganancia."]);
  }
  return null;
}
