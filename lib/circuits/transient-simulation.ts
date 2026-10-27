import type { Circuit, CircuitComponent } from "./types";
import type { SimulationResult } from "./simulation";

export type TransientState = {
  timeSeconds: number;
  capacitorVoltages: Record<string, number>;
  inductorCurrents: Record<string, number>;
  diodeOn: Record<string, boolean>;
  controlledOn: Record<string, boolean>;
};
export type TransientStep = { result: SimulationResult; state: TransientState };

export function createTransientState(): TransientState {
  return { timeSeconds: 0, capacitorVoltages: {}, inductorCurrents: {}, diodeOn: {}, controlledOn: {} };
}

type ControlledSwitch = { controlPositive: string; controlNegative: string; threshold: number; onResistance: number; offResistance: number };
type Branch = {
  id: string;
  component: CircuitComponent;
  a: string;
  b: string;
  kind: "resistor" | "voltage" | "current" | "diode" | "capacitor" | "inductor" | "controlled";
  value: number;
  stateKey?: string;
  control?: ControlledSwitch;
  measurementLabel?: string;
};

function failure(summary: string): SimulationResult {
  return {
    supported: false,
    title: "No se pudo resolver este paso temporal",
    summary,
    measurements: [],
    disclaimer: "No se muestran medidas inventadas. El solver temporal admite redes RLC compatibles, fuentes independientes, diodos aproximados y transistores usados como interruptores. Los modelos siguen siendo educativos y no equivalen a una biblioteca SPICE de fabricante.",
  };
}
function numeric(component: CircuitComponent, key: string, fallback: number): number {
  const value = component.properties[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function solve(matrix: number[][], vector: number[]): number[] | null {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-13) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    for (let j = col; j <= n; j++) a[col][j] /= divisor;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      if (!factor) continue;
      for (let j = col; j <= n; j++) a[row][j] -= factor * a[col][j];
    }
  }
  return a.map((row) => row[n]);
}
function capFarads(component: CircuitComponent): number {
  const unit = String(component.properties.unit ?? "nF").toLowerCase();
  const scales: Record<string, number> = { f:1, mf:1e-3, uf:1e-6, "µf":1e-6, nf:1e-9, pf:1e-12 };
  return numeric(component,"capacitance",100) * (scales[unit] ?? 1e-9);
}
function indHenries(component: CircuitComponent): number {
  const unit = String(component.properties.unit ?? "mH").toLowerCase();
  const scales: Record<string, number> = { h:1, mh:1e-3, uh:1e-6, "µh":1e-6, nh:1e-9 };
  return numeric(component,"inductance",10) * (scales[unit] ?? 1e-3);
}
function ends(component: CircuitComponent): { a: string; b: string } | null {
  const a = component.terminals.find((terminal) => terminal.id === "a") ?? component.terminals[0];
  const b = component.terminals.find((terminal) => terminal.id === "b") ?? component.terminals[1];
  return a && b ? { a:a.id,b:b.id } : null;
}
function terminalExists(circuit: Circuit, componentId: string, terminalId: string): boolean {
  const component=circuit.components.find((item)=>item.id===componentId);
  return Boolean(component?.terminals.some((terminal)=>terminal.id===terminalId));
}

/**
 * One backward-Euler time step using modified nodal analysis.
 * Capacitors use a conductance/current companion; inductors use a
 * conductance plus their previous current. It supports multi-branch RLC
 * networks but does not implement every semiconductor's full nonlinear model.
 */
export function runTransientStep(circuit: Circuit, dtSeconds: number, previous: TransientState): TransientStep {
  if (!(dtSeconds > 0) || !Number.isFinite(dtSeconds) || dtSeconds > 0.1) {
    return { result:failure("El paso temporal debe estar entre 0 y 100 ms."),state:previous };
  }
  if (!circuit.components.length) return { result:failure("Agregá componentes antes de simular."),state:previous };
  const supported = new Set([
    "battery","cell","voltage_source_dc","voltage_source_ac","current_source",
    "resistor","potentiometer","capacitor","polarized_capacitor","inductor",
    "led","diode","photodiode","switch","switch_spst","fuse","lamp","motor",
    "ldr","thermistor","ground","ground_earth","op_amp","relay","npn_transistor","pnp_transistor","mosfet_n","mosfet_p",
  ]);
  const unsupportedTypes=circuit.components.filter((component)=>!supported.has(component.type));
  if (unsupportedTypes.length) {
    return { result:failure("Faltan modelos temporales para: "+unsupportedTypes.map((component)=>component.label+" ("+component.type+")").join(", ")+". Los integrados y los dispositivos acoplados requieren modelos específicos."),state:previous };
  }
  const parent=new Map<string,string>();
  for (const component of circuit.components) for (const terminal of component.terminals) {
    const key=component.id+":"+terminal.id;
    parent.set(key,key);
  }
  const find=(key:string):string=>{
    const p=parent.get(key);
    if (!p) return key;
    if (p===key) return p;
    const root=find(p);parent.set(key,root);return root;
  };
  for (const wire of circuit.wires) {
    if (!terminalExists(circuit,wire.from.componentId,wire.from.terminalId) || !terminalExists(circuit,wire.to.componentId,wire.to.terminalId)) {
      return {result:failure("Un cable apunta a un componente o terminal inexistente."),state:previous};
    }
    const a=wire.from.componentId+":"+wire.from.terminalId;
    const b=wire.to.componentId+":"+wire.to.terminalId;
    const ra=find(a),rb=find(b);
    if (ra!==rb) parent.set(ra,rb);
  }
  for (const component of circuit.components) for (const terminal of component.terminals) {
    const wired=circuit.wires.some((wire)=>
      (wire.from.componentId===component.id&&wire.from.terminalId===terminal.id) ||
      (wire.to.componentId===component.id&&wire.to.terminalId===terminal.id));
    const intentionallyUnusedRelayContact = component.type === "relay" &&
      ["common","normally_open","normally_closed"].includes(terminal.id);
    if (!wired && !intentionallyUnusedRelayContact) return {result:failure(component.label+" tiene el terminal "+terminal.name+" sin cable."),state:previous};
  }
  const sources=circuit.components.filter((component)=>["battery","cell","voltage_source_dc","voltage_source_ac","current_source"].includes(component.type));
  if (!sources.length) return {result:failure("No se encontró una fuente independiente."),state:previous};
  const referenceTerminal=sources[0].terminals.find((terminal)=>["negative","b"].includes(terminal.id));
  if (!referenceTerminal) return {result:failure("No se reconoce el terminal de referencia de "+sources[0].label+"."),state:previous};
  const referenceNode=find(sources[0].id+":"+referenceTerminal.id);
  for (const ground of circuit.components.filter((component)=>component.type==="ground"||component.type==="ground_earth")) {
    if (ground.terminals[0]) {
      const key=ground.id+":"+ground.terminals[0].id;
      const groundRoot=find(key);
      if (groundRoot!==referenceNode) parent.set(groundRoot,referenceNode);
    }
  }
  const nodeOf=(componentId:string,terminalId:string)=>find(componentId+":"+terminalId);
  const internalNodes=new Set<string>();
  for (const component of circuit.components.filter((item)=>item.type==="motor" || item.type==="relay")) {
    const internal=(component.type==="motor"?"@motor:":"@relay:")+component.id;
    parent.set(internal,internal);
    internalNodes.add(internal);
  }
  const allNodes=[...new Set([...circuit.components.flatMap((component)=>component.terminals.map((terminal)=>nodeOf(component.id,terminal.id))),...internalNodes].map(find))]
    .filter((node)=>node!==find(referenceNode));
  const nodeIndex=new Map(allNodes.map((node,index)=>[node,index]));
  const voltageSources=circuit.components.filter((component)=>["battery","cell","voltage_source_dc","voltage_source_ac"].includes(component.type));
  const voltageSourceIndex=new Map(voltageSources.map((component,index)=>[component.id,allNodes.length+index]));
  const sampleTime=previous.timeSeconds+dtSeconds;
  const diodeOn=new Map(circuit.components.filter((component)=>["led","diode","photodiode"].includes(component.type))
    .map((component)=>[component.id,previous.diodeOn[component.id] ?? true]));
  const controlledOn=new Map<string,boolean>([
    ...circuit.components.filter((component)=>["npn_transistor","pnp_transistor","mosfet_n","mosfet_p","relay"].includes(component.type))
      .map((component)=>[component.id,previous.controlledOn[component.id] ?? false] as [string,boolean]),
    ...circuit.components.filter((component)=>component.type==="op_amp").flatMap((component)=>[
      [component.id+":high",previous.controlledOn[component.id+":high"] ?? false] as [string,boolean],
      [component.id+":low",previous.controlledOn[component.id+":low"] ?? false] as [string,boolean],
    ]),
  ]);
  let solution:number[]|null=null;
  let branches:Branch[]=[];
  for(let iteration=0;iteration<12;iteration++) {
    branches=[];
    for(const component of circuit.components) {
      const t=(id:string)=>component.terminals.find((terminal)=>terminal.id===id);
      const first=component.terminals[0],second=component.terminals[1];
      if(component.type==="ground"||component.type==="ground_earth") continue;
      if(["battery","cell","voltage_source_dc","voltage_source_ac"].includes(component.type)) {
        const positive=component.terminals.find((terminal)=>["positive","a"].includes(terminal.id));
        const negative=component.terminals.find((terminal)=>["negative","b"].includes(terminal.id));
        if(!positive||!negative) return {result:failure(component.label+" no tiene polaridad reconocible."),state:previous};
        const nominal=numeric(component,"voltage",0);
        const value=component.type==="voltage_source_ac"
          ? nominal*(String(component.properties.unit??"").toLowerCase().includes("rms")?Math.SQRT2:1)*
            Math.sin(2*Math.PI*Math.max(0,numeric(component,"frequency",50))*sampleTime)
          : nominal;
        branches.push({id:component.id,component,a:nodeOf(component.id,positive.id),b:nodeOf(component.id,negative.id),kind:"voltage",value});
      } else if(component.type==="current_source") {
        if(!first||!second) return {result:failure(component.label+" no tiene dos terminales."),state:previous};
        branches.push({id:component.id,component,a:nodeOf(component.id,first.id),b:nodeOf(component.id,second.id),kind:"current",value:numeric(component,"current",0)});
      } else if(["led","diode","photodiode"].includes(component.type)) {
        const anode=t("anode")??first,cathode=t("cathode")??second;
        if(!anode||!cathode) return {result:failure(component.label+" no tiene ánodo y cátodo reconocibles."),state:previous};
        branches.push({id:component.id,component,a:nodeOf(component.id,anode.id),b:nodeOf(component.id,cathode.id),kind:"diode",value:numeric(component,"forwardVoltage",component.type==="led"?2:0.7),stateKey:component.id});
      } else if(component.type==="op_amp") {
        const nonInverting=t("non_inverting"),inverting=t("inverting"),output=t("output"),vcc=t("vcc"),vee=t("vee");
        if(!nonInverting||!inverting||!output||!vcc||!vee) return {result:failure(component.label+" necesita entradas, salida y alimentación reconocibles."),state:previous};
        const threshold=Math.max(0,numeric(component,"inputOffset",0.001));
        const onResistance=numeric(component,"outputResistance",25);
        const highControl:ControlledSwitch={controlPositive:nodeOf(component.id,nonInverting.id),controlNegative:nodeOf(component.id,inverting.id),threshold,onResistance,offResistance:1e9};
        const lowControl:ControlledSwitch={controlPositive:nodeOf(component.id,inverting.id),controlNegative:nodeOf(component.id,nonInverting.id),threshold,onResistance,offResistance:1e9};
        branches.push({id:component.id+":high",component,a:nodeOf(component.id,output.id),b:nodeOf(component.id,vcc.id),kind:"controlled",value:controlledOn.get(component.id+":high")?onResistance:1e9,control:highControl,measurementLabel:component.label+" salida alta"});
        branches.push({id:component.id+":low",component,a:nodeOf(component.id,output.id),b:nodeOf(component.id,vee.id),kind:"controlled",value:controlledOn.get(component.id+":low")?onResistance:1e9,control:lowControl,measurementLabel:component.label+" salida baja"});
      } else if(["npn_transistor","pnp_transistor","mosfet_n","mosfet_p"].includes(component.type)) {
        let cp:string,cn:string,a:string,b:string,threshold:number;
        if(component.type==="npn_transistor"||component.type==="pnp_transistor") {
          const base=t("base"),collector=t("collector"),emitter=t("emitter");
          if(!base||!collector||!emitter) return {result:failure(component.label+" necesita terminales Base, Colector y Emisor."),state:previous};
          const isPnp=component.type==="pnp_transistor";
          cp=nodeOf(component.id,isPnp?emitter.id:base.id);
          cn=nodeOf(component.id,isPnp?base.id:emitter.id);
          a=nodeOf(component.id,isPnp?emitter.id:collector.id);
          b=nodeOf(component.id,isPnp?collector.id:emitter.id);
          threshold=numeric(component,"vbeOn",0.65);
        } else {
          const gate=t("gate"),drain=t("drain"),source=t("source");
          if(!gate||!drain||!source) return {result:failure(component.label+" tiene terminales de control no reconocidos."),state:previous};
          if(component.type==="mosfet_n"){cp=nodeOf(component.id,gate.id);cn=nodeOf(component.id,source.id);a=nodeOf(component.id,drain.id);b=nodeOf(component.id,source.id);threshold=numeric(component,"gateThreshold",2);}
          else {cp=nodeOf(component.id,source.id);cn=nodeOf(component.id,gate.id);a=nodeOf(component.id,source.id);b=nodeOf(component.id,drain.id);threshold=Math.abs(numeric(component,"gateThreshold",-2));}
        }
        const control:ControlledSwitch={controlPositive:cp,controlNegative:cn,threshold,onResistance:numeric(component,"onResistance",25),offResistance:1e9};
        branches.push({id:component.id,component,a,b,kind:"controlled",value:controlledOn.get(component.id)?control.onResistance:control.offResistance,control});
      } else if(component.type==="capacitor"||component.type==="polarized_capacitor") {
        if(!first||!second) return {result:failure(component.label+" no tiene dos terminales."),state:previous};
        branches.push({id:component.id,component,a:nodeOf(component.id,first.id),b:nodeOf(component.id,second.id),kind:"capacitor",value:capFarads(component),stateKey:component.id});
      } else if(component.type==="inductor") {
        if(!first||!second) return {result:failure(component.label+" no tiene dos terminales."),state:previous};
        branches.push({id:component.id,component,a:nodeOf(component.id,first.id),b:nodeOf(component.id,second.id),kind:"inductor",value:indHenries(component),stateKey:component.id});
      } else if(component.type==="relay") {
        const coil1=t("coil1"),coil2=t("coil2"),common=t("common"),normallyOpen=t("normally_open"),normallyClosed=t("normally_closed");
        if(!coil1||!coil2||!common||!normallyOpen||!normallyClosed) return {result:failure(component.label+" necesita terminales de bobina y contacto reconocibles."),state:previous};
        const internal="@relay:"+component.id;
        branches.push({id:component.id+":coilR",component,a:nodeOf(component.id,coil1.id),b:internal,kind:"resistor",value:Math.max(1e-3,numeric(component,"coilResistance",125)),measurementLabel:component.label+" resistencia de bobina"});
        const coilUnit=String(component.properties.coilInductanceUnit??"mH").toLowerCase();
        const coilInductance=numeric(component,"coilInductance",50)*(coilUnit==="h"?1:["uh","µh"].includes(coilUnit)?1e-6:1e-3);
        branches.push({id:component.id+":coilL",component,a:internal,b:nodeOf(component.id,coil2.id),kind:"inductor",value:coilInductance,stateKey:component.id+":coil",measurementLabel:component.label+" inductancia de bobina"});
        const energized=controlledOn.get(component.id)===true;
        const contactResistance=Math.max(1e-3,numeric(component,"contactResistance",0.05));
        branches.push({id:component.id+":NO",component,a:nodeOf(component.id,common.id),b:nodeOf(component.id,normallyOpen.id),kind:"resistor",value:energized?contactResistance:1e9,measurementLabel:component.label+" contacto NA"});
        branches.push({id:component.id+":NC",component,a:nodeOf(component.id,common.id),b:nodeOf(component.id,normallyClosed.id),kind:"resistor",value:energized?1e9:contactResistance,measurementLabel:component.label+" contacto NC"});
      } else if(component.type==="motor") {
        if(!first||!second) return {result:failure(component.label+" no tiene dos terminales."),state:previous};
        const internal="@motor:"+component.id;
        branches.push({id:component.id+":R",component,a:nodeOf(component.id,first.id),b:internal,kind:"resistor",value:Math.max(1e-3,numeric(component,"resistance",12)),measurementLabel:component.label+" resistencia de bobina"});
        const motorInductance=numeric(component,"inductance",20)*(
          String(component.properties.inductanceUnit??"mH").toLowerCase()==="h"?1:
          ["uh","µh"].includes(String(component.properties.inductanceUnit??"mH").toLowerCase())?1e-6:1e-3);
        branches.push({id:component.id+":L",component,a:internal,b:nodeOf(component.id,second.id),kind:"inductor",value:motorInductance,stateKey:component.id+":coil",measurementLabel:component.label+" inductancia"});
      } else if(component.type==="potentiometer") {
        const a=t("a"),wiper=t("wiper"),b=t("b");
        if(!a||!wiper||!b) return {result:failure(component.label+" no tiene terminales A, cursor y B."),state:previous};
        const total=numeric(component,"resistance",10000);
        const raw=numeric(component,"position",0.5);
        const pos=Math.max(0,Math.min(1,raw>1?raw/100:raw));
        branches.push({id:component.id+":A",component,a:nodeOf(component.id,a.id),b:nodeOf(component.id,wiper.id),kind:"resistor",value:Math.max(1e-3,total*pos),measurementLabel:component.label+" A-cursor"});
        branches.push({id:component.id+":B",component,a:nodeOf(component.id,wiper.id),b:nodeOf(component.id,b.id),kind:"resistor",value:Math.max(1e-3,total*(1-pos)),measurementLabel:component.label+" cursor-B"});
      } else {
        if(!first||!second) return {result:failure(component.label+" no tiene dos terminales."),state:previous};
        const a=nodeOf(component.id,first.id),b=nodeOf(component.id,second.id);
        let resistance=numeric(component,"resistance",component.type==="lamp"?20:component.type==="fuse"?0.05:10000);
        if(["switch","switch_spst"].includes(component.type)||component.type==="fuse") {
          const closed=component.type==="fuse"||component.properties.closed===true;
          resistance=closed?(component.type==="fuse"?0.05:1e-3):1e9;
        }
        branches.push({id:component.id,component,a,b,kind:"resistor",value:resistance});
      }
    }

    const n=allNodes.length+voltageSources.length;
    const matrix=Array.from({length:n},()=>Array(n).fill(0) as number[]);
    const rhs=Array(n).fill(0) as number[];
    const stampG=(a:string,b:string,g:number)=>{
      const ia=nodeIndex.get(a),ib=nodeIndex.get(b);
      if(ia!==undefined) matrix[ia][ia]+=g;
      if(ib!==undefined) matrix[ib][ib]+=g;
      if(ia!==undefined&&ib!==undefined){matrix[ia][ib]-=g;matrix[ib][ia]-=g;}
    };
    for(const branch of branches) {
      if(["resistor","controlled"].includes(branch.kind)) {
        if(!Number.isFinite(branch.value)||branch.value<=0) return {result:failure(branch.component.label+" tiene una resistencia inválida."),state:previous};
        stampG(branch.a,branch.b,1/branch.value);
      } else if(branch.kind==="diode") {
        const isOn=diodeOn.get(branch.component.id)??true;
        const resistance=isOn?1:1e9;
        const g=1/resistance;stampG(branch.a,branch.b,g);
        const ia=nodeIndex.get(branch.a),ib=nodeIndex.get(branch.b),offset=branch.value*g;
        if(ia!==undefined)rhs[ia]+=offset;
        if(ib!==undefined)rhs[ib]-=offset;
      } else if(branch.kind==="capacitor") {
        if(branch.value<=0) return {result:failure(branch.component.label+" tiene una capacitancia inválida."),state:previous};
        const g=branch.value/dtSeconds;
        const previousVoltage=previous.capacitorVoltages[branch.stateKey??branch.id]??0;
        stampG(branch.a,branch.b,g);
        const ia=nodeIndex.get(branch.a),ib=nodeIndex.get(branch.b);
        if(ia!==undefined)rhs[ia]+=g*previousVoltage;
        if(ib!==undefined)rhs[ib]-=g*previousVoltage;
      } else if(branch.kind==="inductor") {
        if(branch.value<=0) return {result:failure(branch.component.label+" tiene una inductancia inválida."),state:previous};
        const g=dtSeconds/branch.value;
        const previousCurrent=previous.inductorCurrents[branch.stateKey??branch.id]??0;
        stampG(branch.a,branch.b,g);
        const ia=nodeIndex.get(branch.a),ib=nodeIndex.get(branch.b);
        if(ia!==undefined)rhs[ia]-=previousCurrent;
        if(ib!==undefined)rhs[ib]+=previousCurrent;
      } else if(branch.kind==="current") {
        const ia=nodeIndex.get(branch.a),ib=nodeIndex.get(branch.b);
        if(ia!==undefined)rhs[ia]-=branch.value;
        if(ib!==undefined)rhs[ib]+=branch.value;
      } else if(branch.kind==="voltage") {
        const k=voltageSourceIndex.get(branch.component.id)!;
        const ia=nodeIndex.get(branch.a),ib=nodeIndex.get(branch.b);
        if(ia!==undefined){matrix[ia][k]+=1;matrix[k][ia]+=1;}
        if(ib!==undefined){matrix[ib][k]-=1;matrix[k][ib]-=1;}
        rhs[k]=branch.value;
      }
    }
    solution=solve(matrix,rhs);
    if(!solution) return {result:failure("La matriz es singular. Revisá cortocircuitos, ramas desconectadas, fuentes ideales en conflicto o nodos flotantes."),state:previous};
    let changed=false;
    for(const branch of branches.filter((item)=>item.kind==="diode")) {
      const va=nodeIndex.has(branch.a)?solution[nodeIndex.get(branch.a)!]:0;
      const vb=nodeIndex.has(branch.b)?solution[nodeIndex.get(branch.b)!]:0;
      const on=va-vb>branch.value;
      if(diodeOn.get(branch.component.id)!==on){diodeOn.set(branch.component.id,on);changed=true;}
    }
    for(const branch of branches.filter((item)=>item.kind==="controlled"&&item.control)) {
      const control=branch.control!;
      const positive=nodeIndex.has(control.controlPositive)?solution[nodeIndex.get(control.controlPositive)!]:0;
      const negative=nodeIndex.has(control.controlNegative)?solution[nodeIndex.get(control.controlNegative)!]:0;
      const on=positive-negative>=control.threshold;
      if(controlledOn.get(branch.id)!==on){controlledOn.set(branch.id,on);changed=true;}
    }
    if(!changed) break;
  }
  if(!solution) return {result:failure("No se encontró una solución temporal."),state:previous};
  const voltageAt=(node:string)=>node===find(referenceNode)?0:solution![nodeIndex.get(node)!]??0;
  const capacitorVoltages={...previous.capacitorVoltages};
  const inductorCurrents={...previous.inductorCurrents};
  const measurements:SimulationResult["measurements"]=[];
  const activeComponentIds:string[]=[];
  const reactiveComponentIds:string[]=[];
  const ledIds=circuit.components.filter((component)=>component.type==="led").map((component)=>component.id);
  for(const branch of branches) {
    const voltage=voltageAt(branch.a)-voltageAt(branch.b);
    let current=0;
    if(branch.kind==="voltage")current=solution[voltageSourceIndex.get(branch.component.id)!]??0;
    else if(branch.kind==="current")current=branch.value;
    else if(branch.kind==="resistor"||branch.kind==="controlled")current=voltage/branch.value;
    else if(branch.kind==="diode")current=((diodeOn.get(branch.component.id)??true)?(voltage-branch.value):voltage/1e9);
    else if(branch.kind==="capacitor"){
      const key=branch.stateKey??branch.id;
      current=branch.value/dtSeconds*(voltage-(previous.capacitorVoltages[key]??0));
      capacitorVoltages[key]=voltage;
      if(!reactiveComponentIds.includes(branch.component.id))reactiveComponentIds.push(branch.component.id);
    } else if(branch.kind==="inductor") {
      const key=branch.stateKey??branch.id;
      current=(previous.inductorCurrents[key]??0)+(dtSeconds/branch.value)*voltage;
      inductorCurrents[key]=current;
      if(!reactiveComponentIds.includes(branch.component.id))reactiveComponentIds.push(branch.component.id);
    }
    measurements.push({label:(branch.measurementLabel??branch.component.label)+": V / I",value:voltage.toFixed(3)+" V · "+(current*1000).toFixed(3)+" mA"});
    if(branch.component.type==="led"&&current>0.001)activeComponentIds.push(branch.component.id);
    if(branch.component.type==="motor"&&Math.abs(current)>0.001)activeComponentIds.push(branch.component.id);
    if(branch.component.type==="led"&&current*1000>numeric(branch.component,"maxCurrent",20)) {
      measurements.push({label:"Advertencia "+branch.component.label,value:"Sobrecorriente: "+(current*1000).toFixed(2)+" mA"});
    }
  }
  for (const relay of circuit.components.filter((component)=>component.type==="relay")) {
    const current=Math.abs(inductorCurrents[relay.id+":coil"] ?? previous.inductorCurrents[relay.id+":coil"] ?? 0);
    const wasEnergized=controlledOn.get(relay.id) ?? false;
    const pickup=Math.max(0,numeric(relay,"pickupCurrent",0.025));
    const dropout=Math.max(0,numeric(relay,"dropoutCurrent",0.015));
    const energized=wasEnergized ? current>=dropout : current>=pickup;
    controlledOn.set(relay.id,energized);
    measurements.push({
      label:relay.label+" estado",
      value:energized ? "Bobina energizada · NA cerrado · NC abierto" : "Bobina desenergizada · NA abierto · NC cerrado",
    });
    if (energized) activeComponentIds.push(relay.id);
  }
  const acSource=circuit.components.find((component)=>component.type==="voltage_source_ac");
  const nextState:TransientState={
    timeSeconds:sampleTime,
    capacitorVoltages,
    inductorCurrents,
    diodeOn:Object.fromEntries(diodeOn),
    controlledOn:Object.fromEntries(controlledOn),
  };
  return {
    result:{
      supported:true,
      title:acSource?"Simulación temporal AC/RLC":"Simulación transitoria multirrama",
      summary:"Se resolvió un paso temporal con MNA y método backward Euler. Los LED muestran conducción aproximada según la corriente calculada; revisá las medidas por rama y las advertencias.",
      measurements,
      activeComponentIds:[...new Set(activeComponentIds)],
      transient:{
        kind:"network",
        frequencyHz:acSource?numeric(acSource,"frequency",50):undefined,
        sourceVoltage:acSource?numeric(acSource,"voltage",0):0,
        resistance:0,initialCurrentA:0,finalCurrentA:0,
        componentIds:reactiveComponentIds,ledIds,
      },
      disclaimer:"Integración temporal backward Euler para redes RLC generales compatibles. NPN/PNP se aproximan como interruptores controlados por umbral VBE y resistencia de conducción; MOSFET usa un interruptor de umbral VGS. No calcula ganancia beta ni una región activa BJT física. Puede introducir amortiguamiento numérico y no sustituye modelos de fabricante, análisis AC de pequeña señal ni un simulador SPICE validado.",
    },
    state:nextState,
  };
}
