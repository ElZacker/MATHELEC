import assert from "node:assert/strict";
import test from "node:test";
import { routeOrthogonalWires } from "../lib/circuits/wire-routing";
import type { Circuit, CircuitComponent, ComponentType, Point } from "../lib/circuits/types";

function connector(id: string, x: number, y: number): CircuitComponent {
  return {
    id, type: "connector" as ComponentType, label: id,
    position: { x, y }, rotation: 0, properties: {},
    terminals: [
      { id: "out", name: "Out", position: { x: 28, y: 0 } },
      { id: "in", name: "In", position: { x: -28, y: 0 } },
    ],
  };
}
function circuit(components: CircuitComponent[], wires: Circuit["wires"]): Circuit {
  return { id: "routing-test", name: "Routing", version: 1, components, wires, createdAt: "", updatedAt: "" };
}
function pointFor(components: CircuitComponent[], componentId: string, terminalId: string): Point {
  const component = components.find((item) => item.id === componentId)!;
  const terminal = component.terminals.find((item) => item.id === terminalId)!;
  const angle = component.rotation * Math.PI / 180;
  return {
    x: component.position.x + terminal.position.x * Math.cos(angle) - terminal.position.y * Math.sin(angle),
    y: component.position.y + terminal.position.x * Math.sin(angle) + terminal.position.y * Math.cos(angle),
  };
}
function intersection(a: Point, b: Point, c: Point, d: Point): { point?: Point; overlap: boolean } | null {
  const ah = Math.abs(a.y-b.y)<0.01, bh = Math.abs(c.y-d.y)<0.01;
  if (ah && bh) {
    if (Math.abs(a.y-c.y)>0.5) return null;
    const lo=Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x));
    const hi=Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x));
    if (hi<lo-0.5) return null;
    return hi-lo>0.5 ? {overlap:true} : {point:{x:(lo+hi)/2,y:a.y},overlap:false};
  }
  if (!ah && Math.abs(a.x-b.x)<0.01 && !bh && Math.abs(c.x-d.x)<0.01) {
    if (Math.abs(a.x-c.x)>0.5) return null;
    const lo=Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y));
    const hi=Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y));
    if (hi<lo-0.5) return null;
    return hi-lo>0.5 ? {overlap:true} : {point:{x:a.x,y:(lo+hi)/2},overlap:false};
  }
  const hA=ah?a:c, hB=ah?b:d, vA=ah?c:a, vB=ah?d:b;
  if (Math.abs(hA.y-hB.y)>0.01 || Math.abs(vA.x-vB.x)>0.01) return null;
  const p={x:vA.x,y:hA.y};
  if (p.x<Math.min(hA.x,hB.x)-0.5 || p.x>Math.max(hA.x,hB.x)+0.5 ||
      p.y<Math.min(vA.y,vB.y)-0.5 || p.y>Math.max(vA.y,vB.y)+0.5) return null;
  return {point:p,overlap:false};
}
function segmentCrossesBox(a: Point,b: Point,x: number,y: number): boolean {
  const left=x-35,right=x+35,top=y-31,bottom=y+31;
  if (Math.abs(a.y-b.y)<0.01) return a.y>top&&a.y<bottom&&Math.max(Math.min(a.x,b.x),left)<Math.min(Math.max(a.x,b.x),right);
  if (Math.abs(a.x-b.x)<0.01) return a.x>left&&a.x<right&&Math.max(Math.min(a.y,b.y),top)<Math.min(Math.max(a.y,b.y),bottom);
  return true;
}

test("A* router returns orthogonal paths without crossings between independent wires", () => {
  const components = [
    connector("A",50,50), connector("B",380,300),
    connector("C",50,300), connector("D",380,50),
    connector("OBSTACLE",215,175),
  ];
  const wires: Circuit["wires"] = [
    { id:"W1", from:{componentId:"A",terminalId:"out"}, to:{componentId:"B",terminalId:"in"} },
    { id:"W2", from:{componentId:"C",terminalId:"out"}, to:{componentId:"D",terminalId:"in"} },
  ];
  const model = circuit(components,wires);
  const routes = routeOrthogonalWires(model,(component,terminalId)=>pointFor(components,component.id,terminalId));
  assert.equal(routes.size,2);
  for (const wire of wires) {
    const path=routes.get(wire.id);
    assert.ok(path && path.length>=2, "Cada cable debe tener una ruta.");
    for (let i=1;i<path!.length;i++) {
      assert.ok(Math.abs(path![i].x-path![i-1].x)<0.01 || Math.abs(path![i].y-path![i-1].y)<0.01,
        "Los cables no deben tener segmentos diagonales.");
      assert.equal(segmentCrossesBox(path![i-1],path![i],215,175),false,
        "La ruta no debe atravesar el componente obstáculo.");
    }
  }
  const pathA=routes.get("W1")!,pathB=routes.get("W2")!;
  for (let i=1;i<pathA.length;i++) for (let j=1;j<pathB.length;j++) {
    assert.equal(intersection(pathA[i-1],pathA[i],pathB[j-1],pathB[j]),null,
      "Dos redes distintas no deben cruzarse ni solaparse.");
  }
});

test("A* router preserves explicitly defined user bends", () => {
  const components=[connector("A",80,80),connector("B",330,250)];
  const wire: Circuit["wires"][number]={id:"manual",from:{componentId:"A",terminalId:"out"},to:{componentId:"B",terminalId:"in"},points:[{x:140,y:40},{x:290,y:40}]};
  const routes=routeOrthogonalWires(circuit(components,[wire]),(component,terminalId)=>pointFor(components,component.id,terminalId));
  assert.deepEqual(routes.get("manual"),[
    pointFor(components,"A","out"),{x:140,y:40},{x:290,y:40},pointFor(components,"B","in"),
  ]);
});
