"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";

import {
  addComponent,
  createCircuit,
  connectTerminals,
  disconnectWire,
  removeComponent,
  rotateComponent,
  moveComponent,
} from "@/lib/circuits/circuit-model";


import { validateCircuit } from "@/lib/circuits/validation";
import { getAvailableComponentTypes } from "@/lib/circuits/components";
import { importSpiceNetlist } from "@/lib/circuits/import-spice";

import type { Circuit, ComponentType, ValidationIssue } from "@/lib/circuits/types";
type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type Chat = {
  id: string;
  title: string;
  messages: Message[];
};

const starterIdeas = [
  "Diseñar un LED intermitente con un NE555",
  "Crear una alarma con sensor de luz",
  "Armar un contador digital con CD4017",
];



function CircuitPreview({
  circuit,
  onMove,
  onConnect,
  onDeleteWire,
  highlightedComponentIds,
  highlightedWireIds,
}: {
  circuit: Circuit;
  onMove: (componentId: string, x: number, y: number) => void;
  onConnect: (fromComponentId: string, fromTerminalId: string, toComponentId: string, toTerminalId: string, points: { x: number; y: number }[]) => void;
  onDeleteWire: (wireId: string) => void;
  highlightedComponentIds: string[];
  highlightedWireIds: string[];
}) {
  const componentColor = "#45f59a";
  const [wireDraft, setWireDraft] = useState<{
    from: { componentId: string; terminalId: string };
    points: { x: number; y: number }[];
    cursor: { x: number; y: number };
  } | null>(null);

  function getTerminalPoint(component: Circuit["components"][number], terminalId: string) {
    const terminal = component.terminals.find((item) => item.id === terminalId);
    if (!terminal) return component.position;
    const angle = (component.rotation * Math.PI) / 180;
    return {
      x: component.position.x + terminal.position.x * Math.cos(angle) - terminal.position.y * Math.sin(angle),
      y: component.position.y + terminal.position.x * Math.sin(angle) + terminal.position.y * Math.cos(angle),
    };
  }

  function handleTerminalClick(componentId: string, terminalId: string) {
    if (!wireDraft) {
      const component = circuit.components.find((item) => item.id === componentId);
      if (!component) return;
      const point = getTerminalPoint(component, terminalId);
      setWireDraft({
        from: { componentId, terminalId },
        points: [],
        cursor: point,
      });
      return;
    }

    if (wireDraft.from.componentId === componentId && wireDraft.from.terminalId === terminalId) {
      setWireDraft(null);
      return;
    }

    onConnect(
      wireDraft.from.componentId,
      wireDraft.from.terminalId,
      componentId,
      terminalId,
      wireDraft.points,
    );
    setWireDraft(null);
  }

  const dragging = useRef<{
  id: string;
  offsetX: number;
  offsetY: number;
} | null>(null);

const svgRef = useRef<SVGSVGElement>(null);

function getSvgPoint(event: React.PointerEvent<SVGElement>) {
  const svg = svgRef.current;
  if (!svg) return { x: 0, y: 0 };

  const rect = svg.getBoundingClientRect();

  return {
    x: ((event.clientX - rect.left) / rect.width) * 440,
    y: ((event.clientY - rect.top) / rect.height) * 330,
  };
}

  return (
    <svg
  ref={svgRef}
  className="circuit-drawing"
      
      onPointerMove={(event) => {
        const point = getSvgPoint(event);
        const current = dragging.current;
        if (current) {
          onMove(
            current.id,
            Math.max(15, Math.min(425, point.x - current.offsetX)),
            Math.max(15, Math.min(315, point.y - current.offsetY)),
          );
        }
        setWireDraft((draft) => draft ? { ...draft, cursor: point } : null);
      }}
      onClick={(event) => {
        if (!wireDraft) return;
        const target = event.target as SVGElement;
        if (target.closest("[data-circuit-item='true']")) return;
        const point = getSvgPoint(event as unknown as React.PointerEvent<SVGSVGElement>);
        setWireDraft((draft) => draft ? { ...draft, points: [...draft.points, point], cursor: point } : null);
      }}
      onPointerUp={() => {
        dragging.current = null;
      }}
      onPointerCancel={() => {
        dragging.current = null;
      }}
      style={{ touchAction: "none" }}

      viewBox="0 0 440 330"
      role="img"
      aria-label="Vista de los componentes del circuito"
    >
      <defs>
        <pattern
          id="circuit-grid"
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1" cy="1" r="1" fill="#284535" />
        </pattern>
      </defs>

      <rect width="440" height="330" fill="url(#circuit-grid)" />

      {circuit.wires.map((wire) => {
        const from = circuit.components.find((component) => component.id === wire.from.componentId);
        const to = circuit.components.find((component) => component.id === wire.to.componentId);
        if (!from || !to) return null;
        const fromPoint = getTerminalPoint(from, wire.from.terminalId);
        const toPoint = getTerminalPoint(to, wire.to.terminalId);
        const points = [fromPoint, ...(wire.points ?? []), toPoint];
        const pointString = points.map((point) => `${point.x},${point.y}`).join(" ");

        return (
          <g key={wire.id} className={highlightedWireIds.includes(wire.id) ? "circuit-wire circuit-item-highlighted" : "circuit-wire"} data-circuit-item="true" onClick={(event) => { event.stopPropagation(); onDeleteWire(wire.id); }} style={{ cursor: "pointer" }}>
            <polyline points={pointString} fill="none" stroke={highlightedWireIds.includes(wire.id) ? "#ff7373" : componentColor} strokeWidth={highlightedWireIds.includes(wire.id) ? "4" : "2"} />
            <polyline points={pointString} fill="none" stroke="transparent" strokeWidth="12" />
          </g>
        );
      })}

      {wireDraft && (() => {
        const source = circuit.components.find((component) => component.id === wireDraft.from.componentId);
        if (!source) return null;
        const startPoint = getTerminalPoint(source, wireDraft.from.terminalId);
        const points = [startPoint, ...wireDraft.points, wireDraft.cursor];
        return <polyline key="wire-preview" points={points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="#f7d774" strokeWidth="2" strokeDasharray="5 4" pointerEvents="none" />;
      })()}

      {circuit.components.map((component) => (
        <g
          key={component.id}
          data-circuit-item="true"
          className={highlightedComponentIds.includes(component.id) ? "circuit-component circuit-item-highlighted" : "circuit-component"}
          onClick={(event) => event.stopPropagation()}
    onPointerDown={(event) => {
      event.preventDefault();
      event.stopPropagation();

      const point = getSvgPoint(
        event as unknown as React.PointerEvent<SVGSVGElement>,
      );

      dragging.current = {
        id: component.id,
        offsetX: point.x - component.position.x,
        offsetY: point.y - component.position.y,
      };

      event.currentTarget.ownerSVGElement?.setPointerCapture(
        event.pointerId,
      );
    }}
    style={{ cursor: "grab" }}

          transform={`translate(${component.position.x}, ${component.position.y}) rotate(${component.rotation})`}
          fill="#07130c"
          stroke={componentColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {component.type === "battery" && (
            <>
              <line x1="-25" y1="0" x2="-9" y2="0" />
              <line x1="-9" y1="-13" x2="-9" y2="13" />
              <line x1="1" y1="-7" x2="1" y2="7" />
              <line x1="1" y1="0" x2="25" y2="0" />
              <line x1="-9" y1="0" x2="1" y2="0" />
              <text x="-5" y="-18" fill="#e4fff0" stroke="none" fontSize="10">+</text>
              <text x="8" y="17" fill="#e4fff0" stroke="none" fontSize="10">−</text>
            </>
          )}

          {component.type === "resistor" && (
            <>
              <line x1="-30" y1="0" x2="-17" y2="0" />
              <rect x="-17" y="-8" width="34" height="16" rx="2" />
              <line x1="17" y1="0" x2="30" y2="0" />
            </>
          )}

          {component.type === "led" && (
            <>
              <line x1="-28" y1="0" x2="-10" y2="0" />
              <path d="M-10 -12 L12 0 L-10 12 Z" />
              <line x1="12" y1="-13" x2="12" y2="13" />
              <line x1="12" y1="0" x2="28" y2="0" />
              <path d="M-4 -17 L2 -23 M2 -23 L2 -18 M2 -23 L-3 -23" />
              <path d="M5 -18 L11 -24 M11 -24 L11 -19 M11 -24 L6 -24" />
            </>
          )}

          {component.type === "switch" && (
            <>
              <line x1="-28" y1="0" x2="-9" y2="0" />
              <circle cx="-9" cy="0" r="3" />
              <circle cx="20" cy="0" r="3" />
              <line x1="-7" y1="-2" x2="16" y2="-14" />
              <line x1="20" y1="0" x2="28" y2="0" />
            </>
          )}

          {component.type === "ground" && (
            <>
              <line x1="0" y1="-17" x2="0" y2="0" />
              <line x1="-14" y1="0" x2="14" y2="0" />
              <line x1="-9" y1="6" x2="9" y2="6" />
              <line x1="-4" y1="12" x2="4" y2="12" />
            </>
          )}

          {!["battery", "resistor", "led", "switch", "ground"].includes(component.type) && (
            <>
              <rect x="-24" y="-17" width="48" height="34" rx={["ic_555", "ic_4017", "op_amp", "logic_gate_and", "logic_gate_or", "logic_gate_not"].includes(component.type) ? 3 : 9} fill="#10291c" stroke="#45f59a" />
              <text x="0" y="4" fill="#b8ffd2" stroke="none" textAnchor="middle" fontSize="10" fontWeight="700">
                {({ diode: "D", capacitor: "C", polarized_capacitor: "C+", inductor: "L", npn_transistor: "NPN", pnp_transistor: "PNP", mosfet_n: "NMOS", mosfet_p: "PMOS", op_amp: "A", voltage_source_ac: "~V", current_source: "I", fuse: "F", motor: "M", lamp: "LP", push_button: "PB", relay: "K", photodiode: "PD", ldr: "LDR", thermistor: "TH", potentiometer: "RV", zener_diode: "DZ", logic_gate_and: "&", logic_gate_or: "≥1", logic_gate_not: "¬", ic_555: "555", ic_4017: "4017", connector: "J" } as Partial<Record<ComponentType, string>>)[component.type] ?? "?"}
              </text>
            </>
          )}

          <text
            x="0"
            y="32"
            fill="#e4fff0"
            stroke="none"
            textAnchor="middle"
            fontSize="10"
          >
            {component.label}
          </text>
        </g>
      ))}

      {circuit.components.flatMap((component) => component.terminals.map((terminal) => {
        const point = getTerminalPoint(component, terminal.id);
        const selected = wireDraft?.from.componentId === component.id && wireDraft.from.terminalId === terminal.id;
        return (
          <g
            key={`${component.id}-terminal-${terminal.id}`}
            data-circuit-item="true"
            transform={`translate(${point.x}, ${point.y})`}
            role="button"
            aria-label={`Terminal ${terminal.name} de ${component.label}`}
            tabIndex={0}
            onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
            onClick={(event) => { event.stopPropagation(); handleTerminalClick(component.id, terminal.id); }}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); handleTerminalClick(component.id, terminal.id); } }}
            style={{ cursor: "crosshair" }}
          >
            <circle r={selected ? 7 : 5} fill={selected ? "#f7d774" : "#07130c"} stroke={selected ? "#f7d774" : componentColor} strokeWidth="2" />
            <circle r="11" fill="transparent" />
          </g>
        );
      }))}

      {circuit.components.length === 0 && (
        <text
          x="220"
          y="165"
          textAnchor="middle"
          fill="#719b80"
          stroke="none"
          fontSize="12"
        >
          Agregá un componente para comenzar
        </text>
      )}
    </svg>
  );
}


export default function Home() {
  const [chats, setChats] = useState<Chat[]>(() => [{
    id: "chat-inicial",
    title: "Nuevo proyecto",
    messages: [],
  }]);
  const [activeChatId, setActiveChatId] = useState("chat-inicial");
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(null);
  const [generationElapsed, setGenerationElapsed] = useState(0);
  
const [circuit, setCircuit] = useState<Circuit>(() => ({
  id: "circuit-principal",
  name: "Mi primer circuito",
  version: 1,
  components: [],
  wires: [],
  createdAt: "",
  updatedAt: "",
}));

const [selectedValidationIssue, setSelectedValidationIssue] = useState<ValidationIssue | null>(null);
const [validationIssues, setValidationIssues] = useState(() =>
  validateCircuit({
    id: "circuit-principal",
    name: "Mi primer circuito",
    version: 1,
    components: [],
    wires: [],
    createdAt: "",
    updatedAt: "",
  })
);

function handleAddComponent(type: ComponentType) {
  try {
    const nextCircuit = addComponent(
      circuit,
      type,
      100 + circuit.components.length * 60,
      100,
    );

    setCircuit(nextCircuit);
    setValidationIssues(validateCircuit(nextCircuit));
    setSelectedValidationIssue(null);
    setNotice(`Componente agregado: ${type}.`);
  } catch (error) {
    setNotice(
      error instanceof Error
        ? error.message
        : "No se pudo agregar el componente.",
    );
  }
}

function handleRemoveComponent(componentId: string) {
  const nextCircuit = removeComponent(circuit, componentId);

  setCircuit(nextCircuit);
  setValidationIssues(validateCircuit(nextCircuit));
  setNotice("Componente eliminado.");
}

function handleConnectTerminals(fromComponentId: string, fromTerminalId: string, toComponentId: string, toTerminalId: string, points: { x: number; y: number }[]) {
  try {
    const nextCircuit = connectTerminals(circuit, fromComponentId, fromTerminalId, toComponentId, toTerminalId, undefined, points);
    setCircuit(nextCircuit);
    setValidationIssues(validateCircuit(nextCircuit));
    setNotice("Cable conectado. Hacé clic en el cable para eliminarlo.");
  } catch (error) {
    setNotice(error instanceof Error ? error.message : "No se pudo crear la conexión.");
  }
}

function handleDeleteWire(wireId: string) {
  const nextCircuit = disconnectWire(circuit, wireId);
  setCircuit(nextCircuit);
  setValidationIssues(validateCircuit(nextCircuit));
  setNotice("Cable eliminado.");
}

function handleMoveComponent(
  componentId: string,
  x: number,
  y: number,
) {
  setCircuit((current) => ({
    ...current,
    components: current.components.map((component) =>
      component.id === componentId
        ? {
            ...component,
            position: { x, y },
          }
        : component,
    ),
  }));
}


  const [files, setFiles] = useState<File[]>([]);
  const [notice, setNotice] = useState("");
  const [previewTab, setPreviewTab] = useState<"Esquema" | "PCB" | "Protoboard">("Esquema");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const projectFileInput = useRef<HTMLInputElement>(null);
  const spiceFileInput = useRef<HTMLInputElement>(null);
  const messageEnd = useRef<HTMLDivElement>(null);
  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? chats[0];

  useEffect(() => {
    if (!isGenerating || generationStartedAt === null) return;
    const updateElapsed = () => setGenerationElapsed((Date.now() - generationStartedAt) / 1000);
    updateElapsed();
    const interval = window.setInterval(updateElapsed, 100);
    return () => window.clearInterval(interval);
  }, [isGenerating, generationStartedAt]);

  useEffect(() => {
    messageEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chats, isGenerating, activeChatId]);

  function newChat() {
    const id = crypto.randomUUID();
    const chat: Chat = {
      id,
      title: "Nuevo proyecto",
      messages: [],
    };
    setChats((current) => [chat, ...current]);
    setActiveChatId(id);
    setInput("");
    setFiles([]);
    setNotice("");
    setSidebarOpen(false);
  }

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    const allowedExtensions = new Set([
      "txt", "md", "pdf", "png", "jpg", "jpeg", "webp", "json", "xml",
      "cir", "sch", "brd", "dsn", "asc", "lw", "pcb", "zip",
    ]);
    const allowed = selected.filter((file) =>
      allowedExtensions.has(file.name.split(".").pop()?.toLowerCase() ?? "")
    );
    const rejected = selected.length - allowed.length;

    setFiles((current) => [...current, ...allowed].slice(0, 5));
    if (rejected > 0) {
      setNotice("Se omitieron archivos con una extensión no admitida. Se aceptan hasta 5 adjuntos.");
    } else if (allowed.length > 0) {
      setNotice("Adjuntos listos. Esta versión aún no puede leer ni convertir su contenido.");
    }
    event.target.value = "";
  }

  async function sendMessage(event?: FormEvent<HTMLFormElement>, suggestedText?: string) {
    event?.preventDefault();
    const content = (suggestedText ?? input).trim();

    if (!content && files.length === 0) {
      setNotice("Escribí un mensaje o adjuntá un archivo antes de enviar.");
      return;
    }
    if (!activeChat || isGenerating) return;
    if (files.length > 0) {
      setNotice("Los adjuntos todavía no se analizan. Quitalos para generar una propuesta a partir del texto.");
      return;
    }

    const normalized = content.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
    const replyToCommand = (text: string) => {
      const userMessage: Message = { id: crypto.randomUUID(), role: "user", text: content };
      const assistantMessage: Message = { id: crypto.randomUUID(), role: "assistant", text };
      setChats((current) => current.map((chat) => chat.id === activeChat.id
        ? { ...chat, messages: [...chat.messages, userMessage, assistantMessage] } : chat));
      setInput("");
      setNotice("");
    };
    // Todas las instrucciones, incluidas las ediciones del circuito, se interpretan con Gemini.
    const userMessage: Message = { id: crypto.randomUUID(), role: "user", text: content };
    setChats((current) => current.map((chat) => chat.id === activeChat.id ? {
      ...chat,
      title: chat.title === "Nuevo proyecto" ? content.slice(0, 38) : chat.title,
      messages: [...chat.messages, userMessage],
    } : chat));
    setInput("");
    setNotice("");
    const startedAt = Date.now();
    setGenerationStartedAt(startedAt);
    setGenerationElapsed(0);
    setIsGenerating(true);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: content, currentCircuit: { id: circuit.id, name: circuit.name, components: circuit.components.map((component) => ({ id: component.id, type: component.type, label: component.label, position: component.position, rotation: component.rotation, properties: component.properties, terminals: component.terminals.map((terminal) => ({ id: terminal.id, name: terminal.name })) })), wires: circuit.wires.map((wire) => ({ id: wire.id, from: wire.from, to: wire.to, points: wire.points ?? [] })) } }),
      });
      const data: {
        mode?: "demo" | "ai";
        actions?: Record<string, unknown>[];
        response?: string;
        title?: string; explanation?: string;
        components?: { type: ComponentType; x: number; y: number }[];
        wires?: { from: { componentIndex: number; terminalId: string }; to: { componentIndex: number; terminalId: string } }[];
        confirmedRequirements?: string[]; assumptions?: string[];
        missingInformation?: string[]; warnings?: string[]; error?: string;
      } = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudo generar la propuesta.");

      let assistantText = data.response?.trim() || data.explanation?.trim() || "Listo. ¿Qué te gustaría hacer ahora?";
      let nextCircuit = circuit;
      const actionWarnings: string[] = [];
      const findByReference = (reference: unknown) => typeof reference === "string"
        ? nextCircuit.components.find((component) => component.label.toUpperCase() === reference.toUpperCase() || component.id === reference)
        : undefined;
      for (const action of data.actions ?? []) {
        try {
          if (action.type === "add_component") {
            const aliases: Record<string, ComponentType> = { battery: "battery", bateria: "battery", "batería": "battery", pila: "battery", resistor: "resistor", resistencia: "resistor", led: "led", diodo: "diode", switch: "switch", interruptor: "switch", ground: "ground", tierra: "ground", masa: "ground", capacitor: "capacitor", condensador: "capacitor", "capacitor electrolitico": "polarized_capacitor", bobina: "inductor", inductor: "inductor", transistor: "npn_transistor", npn: "npn_transistor", pnp: "pnp_transistor", mosfet: "mosfet_n", operacional: "op_amp", "amplificador operacional": "op_amp", fusible: "fuse", motor: "motor", lampara: "lamp", lámpara: "lamp", pulsador: "push_button", rele: "relay", relé: "relay", fotodiodo: "photodiode", ldr: "ldr", termistor: "thermistor", potenciometro: "potentiometer", potenciómetro: "potentiometer", zener: "zener_diode", "puerta and": "logic_gate_and", "puerta or": "logic_gate_or", "puerta not": "logic_gate_not", ne555: "ic_555", "555": "ic_555", cd4017: "ic_4017", conector: "connector", fuente: "voltage_source_ac" };
            const componentType = typeof action.componentType === "string" ? aliases[action.componentType.toLowerCase()] : undefined;
            if (!componentType) throw new Error("Tipo de componente no disponible.");
            if (nextCircuit.components.length >= 30) throw new Error("Se alcanzó el límite de 30 componentes.");
            const x = typeof action.x === "number" && Number.isFinite(action.x) ? action.x : 220;
            const y = typeof action.y === "number" && Number.isFinite(action.y) ? action.y : 165;
            nextCircuit = addComponent(nextCircuit, componentType, Math.max(30, Math.min(410, x)), Math.max(40, Math.min(290, y)));
          } else if (action.type === "rotate_component") {
            const target = findByReference(action.reference);
            if (!target) throw new Error("No encontré " + String(action.reference ?? "") + " para rotar.");
            const turns = Math.max(1, Math.min(4, Math.round(typeof action.quarterTurns === "number" ? action.quarterTurns : 1)));
            for (let i = 0; i < turns; i++) nextCircuit = rotateComponent(nextCircuit, target.id);
          } else if (action.type === "move_component") {
            const target = findByReference(action.reference);
            if (!target || typeof action.x !== "number" || typeof action.y !== "number") throw new Error("Referencia o posición inválida para mover.");
            nextCircuit = moveComponent(nextCircuit, target.id, Math.max(15, Math.min(425, action.x)), Math.max(15, Math.min(315, action.y)));
          } else if (action.type === "delete_component") {
            const target = findByReference(action.reference);
            if (!target) throw new Error("No encontré " + String(action.reference ?? "") + " para eliminar.");
            nextCircuit = removeComponent(nextCircuit, target.id);
          } else if (action.type === "clear_circuit") {
            nextCircuit = createCircuit(nextCircuit.name);
          } else if (action.type === "connect") {
            const from = findByReference(action.fromReference), to = findByReference(action.toReference);
            if (!from || !to || typeof action.fromTerminal !== "string" || typeof action.toTerminal !== "string") throw new Error("Conexión sin referencias o terminales válidos.");
            nextCircuit = connectTerminals(nextCircuit, from.id, action.fromTerminal, to.id, action.toTerminal);
          } else if (action.type === "disconnect") {
            const from = findByReference(action.fromReference), to = findByReference(action.toReference);
            if (!from || !to) throw new Error("No encontré ambos componentes para desconectar.");
            const matchingWires = nextCircuit.wires.filter((item) => (item.from.componentId === from.id && item.to.componentId === to.id) || (item.from.componentId === to.id && item.to.componentId === from.id));
            if (!matchingWires.length) throw new Error("No existe un cable directo entre " + from.label + " y " + to.label + ".");
            for (const wire of matchingWires) nextCircuit = disconnectWire(nextCircuit, wire.id);
          } else if (action.type === "update_properties") {
            const target = findByReference(action.reference);
            if (!target || !action.properties || typeof action.properties !== "object" || Array.isArray(action.properties)) throw new Error("Propiedades inválidas.");
            const props = Object.fromEntries(Object.entries(action.properties as Record<string, unknown>).filter(([key, value]) => ["voltage", "resistance", "forwardVoltage", "state", "name"].includes(key) && ["string", "number", "boolean"].includes(typeof value))) as Record<string, string | number | boolean>;
            nextCircuit = { ...nextCircuit, components: nextCircuit.components.map((item) => item.id === target.id ? { ...item, properties: { ...item.properties, ...props } } : item), updatedAt: new Date().toISOString() };
          } else actionWarnings.push("Gemini devolvió una acción no compatible y se omitió.");
        } catch (error) { actionWarnings.push(error instanceof Error ? error.message : "Se omitió una acción inválida."); }
      }
      const componentIds: string[] = [];
      if (data.components?.length) {
        if (nextCircuit.components.length + data.components.length > 30) throw new Error("La propuesta supera el límite de 30 componentes.");
        for (const item of data.components) {
          if (!getAvailableComponentTypes().includes(item.type)) {
            throw new Error("La propuesta contiene un tipo de componente no admitido.");
          }
          nextCircuit = addComponent(nextCircuit, item.type, item.x, item.y);
          componentIds.push(nextCircuit.components[nextCircuit.components.length - 1].id);
        }
      }
      if (data.wires?.length) {
        for (const wire of data.wires) {
          const fromId = componentIds[wire.from.componentIndex];
          const toId = componentIds[wire.to.componentIndex];
          if (!fromId || !toId) throw new Error("No pude aplicar una conexión porque la propuesta no identifica componentes nuevos válidos.");
          nextCircuit = connectTerminals(nextCircuit, fromId, wire.from.terminalId, toId, wire.to.terminalId);
        }
      }
      if (nextCircuit !== circuit) {
        const issues = validateCircuit(nextCircuit);
        setCircuit(nextCircuit);
        setValidationIssues(issues);
        setSelectedValidationIssue(null);
      }
      if (actionWarnings.length) assistantText += "\n\nAcciones no aplicadas: " + actionWarnings.join(" ");
      if (data.missingInformation?.length && !data.response) {
        assistantText += "\\n\\nPara seguir, necesito aclarar: " + data.missingInformation.join("; ");
      }
      if (data.warnings?.length && data.components?.length) {
        assistantText += "\\n\\nOjo: " + data.warnings.join(" ");
      }

      const elapsedSeconds = (Date.now() - startedAt) / 1000;
      assistantText += `\n\nTiempo de respuesta: ${elapsedSeconds < 10 ? elapsedSeconds.toFixed(1) : Math.round(elapsedSeconds)} s`;
      const assistantMessage: Message = { id: crypto.randomUUID(), role: "assistant", text: assistantText };
      setChats((current) => current.map((chat) => chat.id === activeChat.id
        ? { ...chat, messages: [...chat.messages, assistantMessage] } : chat));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Ocurrió un error inesperado.";
      setChats((current) => current.map((chat) => chat.id === activeChat.id
        ? { ...chat, messages: [...chat.messages, { id: crypto.randomUUID(), role: "assistant", text: "No se pudo generar la propuesta: " + errorMessage + `\n\nTiempo hasta el error: ${((Date.now() - startedAt) / 1000).toFixed(1)} s` }] } : chat));
    } finally {
      setIsGenerating(false);
      setGenerationStartedAt(null);
      requestAnimationFrame(() => messageEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
    }
  }

  function downloadTextFile(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportCircuitSvg() {
    const source = document.querySelector(".circuit-drawing");
    if (!(source instanceof SVGSVGElement)) {
      setNotice("No se encontró el esquema para exportar. Abrí la Vista previa e intentá nuevamente.");
      return;
    }
    const clone = source.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", "880");
    clone.setAttribute("height", "660");
    const serialized = new XMLSerializer().serializeToString(clone);
    downloadTextFile("mathelect-esquema.svg", serialized, "image/svg+xml;charset=utf-8");
    setNotice("Esquema SVG exportado. Es una imagen vectorial, no un archivo nativo de simulación.");
  }

  function exportConnectionReport() {
    const lines = [
      "MATHELEC — Informe de conexiones",
      "Proyecto: " + circuit.name,
      "Componentes: " + circuit.components.length,
      "Conexiones: " + circuit.wires.length,
      "",
      "COMPONENTES",
      ...circuit.components.map((component) =>
        "- " + component.label + " (" + component.type + "), referencia " + component.id +
        ", posición (" + Math.round(component.position.x) + ", " + Math.round(component.position.y) + ")"
      ),
      "",
      "CONEXIONES",
      ...(circuit.wires.length ? circuit.wires.map((wire, index) => {
        const from = circuit.components.find((component) => component.id === wire.from.componentId);
        const to = circuit.components.find((component) => component.id === wire.to.componentId);
        const fromTerminal = from?.terminals.find((terminal) => terminal.id === wire.from.terminalId);
        const toTerminal = to?.terminals.find((terminal) => terminal.id === wire.to.terminalId);
        return (index + 1) + ". " + (from?.label ?? wire.from.componentId) + " [" +
          (fromTerminal?.name ?? wire.from.terminalId) + "] → " +
          (to?.label ?? wire.to.componentId) + " [" + (toTerminal?.name ?? wire.to.terminalId) + "]";
      }) : ["No hay conexiones registradas."]),
      "",
      "ADVERTENCIA: este informe enumera los datos guardados en el proyecto. No demuestra que el circuito sea eléctricamente correcto ni que haya sido simulado."
    ];
    downloadTextFile("mathelect-conexiones.txt", lines.join("\n"), "text/plain;charset=utf-8");
    setNotice("Informe de conexiones exportado. Revisá la advertencia incluida al final del archivo.");
  }

  function saveProjectFile() {
    const now = new Date().toISOString();
    const project = {
      ...circuit,
      createdAt: circuit.createdAt || now,
      updatedAt: now,
    };
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = (project.name || "mathelect-proyecto").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") + ".mathelect.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice("Proyecto exportado en formato JSON de Mathelect. Guardalo en una carpeta fácil de encontrar.");
  }

  async function loadProjectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setNotice("El archivo supera el límite de 2 MB.");
      return;
    }
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object") throw new Error("El archivo no contiene un objeto de proyecto.");
      const candidate = parsed as Partial<Circuit>;
      const validTypes = getAvailableComponentTypes();
      if (
        candidate.version !== 1 ||
        typeof candidate.id !== "string" ||
        typeof candidate.name !== "string" ||
        !Array.isArray(candidate.components) ||
        !Array.isArray(candidate.wires)
      ) throw new Error("No parece un proyecto Mathelect compatible (se requiere version 1, componentes y cables).");

      for (const item of candidate.components) {
        if (!item || typeof item !== "object" || !validTypes.includes(item.type) ||
          typeof item.id !== "string" || typeof item.label !== "string" ||
          !item.position || !Number.isFinite(item.position.x) || !Number.isFinite(item.position.y) ||
          !Array.isArray(item.terminals) || !item.properties || typeof item.properties !== "object") {
          throw new Error("El archivo contiene un componente incompleto o no compatible.");
        }
      }
      for (const wire of candidate.wires) {
        if (!wire || typeof wire !== "object" || typeof wire.id !== "string" ||
          !wire.from || typeof wire.from.componentId !== "string" || typeof wire.from.terminalId !== "string" ||
          !wire.to || typeof wire.to.componentId !== "string" || typeof wire.to.terminalId !== "string" ||
          (wire.points !== undefined && (!Array.isArray(wire.points) || wire.points.some((point) => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))))) {
          throw new Error("El archivo contiene una conexión incompleta o no compatible.");
        }
      }

      const imported: Circuit = {
        id: candidate.id,
        name: candidate.name,
        version: 1,
        components: candidate.components as Circuit["components"],
        wires: candidate.wires as Circuit["wires"],
        createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setCircuit(imported);
      setValidationIssues(validateCircuit(imported));
      setSelectedValidationIssue(null);
      setNotice(`Proyecto “${imported.name}” abierto. Revisá los avisos de validación si aparecen.`);
    } catch (error) {
      setNotice(error instanceof Error ? "No se pudo abrir el proyecto: " + error.message : "No se pudo leer el archivo seleccionado.");
    }
  }

  async function importSpiceFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 1_000_000) {
      setNotice("La netlist supera el límite de 1 MB.");
      return;
    }
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!["cir", "net", "sp", "ckt", "txt"].includes(extension ?? "")) {
      setNotice("Este importador solo admite netlists SPICE de texto (.cir, .net, .sp, .ckt o .txt). No admite archivos nativos de Livewire.");
      return;
    }
    try {
      const result = importSpiceNetlist(await file.text(), file.name.replace(/\.[^.]+$/, ""));
      const issues = validateCircuit(result.circuit);
      setCircuit(result.circuit);
      setValidationIssues(issues);
      setSelectedValidationIssue(null);
      const details = [
        `Importación parcial completada: ${result.circuit.components.length} componentes y ${result.circuit.wires.length} conexiones.`,
        ...result.warnings,
        ...(result.unsupportedLines.length ? ["Elementos omitidos:", ...result.unsupportedLines] : []),
        ...(issues.length ? [`El verificador de MATHELEC generó ${issues.length} aviso(s); revisalos antes de confiar en el esquema.`] : []),
      ];
      setNotice(details.join(" "));
    } catch (error) {
      setNotice(error instanceof Error ? "No se pudo importar la netlist: " + error.message : "No se pudo leer la netlist.");
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, i) => i !== index));
  }

  return (
    <main className={`mathelec-app ${previewOpen ? "preview-is-open" : "preview-is-closed"}`}>
      <aside className={`history-sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
       
<a className="brand" href="#" onClick={(event) => event.preventDefault()}>
  <span className="brand-logo">
    <img src="/mathelec-logo.png" alt="Logo oficial de MATHELEC" />
  </span>
  <span className="brand-copy">
    <strong>MATHELEC</strong>
    <small>Tu asistente IA de electrónica</small>
  </span>
</a>


        <button className="new-chat-button" onClick={newChat} type="button">
          <span className="plus-mark">＋</span><span>Nuevo proyecto</span><span className="shortcut">+</span>
        </button>

        <div className="history-label">TU ESPACIO</div>
        <button className="history-link" type="button" onClick={() => {
          setSidebarOpen(false);
          setNotice("Estás en el espacio de trabajo de Mathelec.");
        }}>
          <span className="nav-icon">⌂</span><span>Inicio</span>
        </button>

        <div className="history-label recent-label">RECIENTES</div>
        <div className="chat-history-list">
          {chats.map((chat) => (
            <button
              key={chat.id}
              type="button"
              className={`history-link chat-history-item ${chat.id === activeChatId ? "history-active" : ""}`}
              onClick={() => {
                setActiveChatId(chat.id);
                setSidebarOpen(false);
                setNotice("");
              }}
              title={chat.title}
            >
              <span className="nav-icon">▤</span><span className="history-title">{chat.title}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-bottom">
          <div className="plan-card">
            <span className="plan-icon">✳</span>
            <strong>Mathelec Lab</strong>
            <p>Tu laboratorio de electrónica, en un solo lugar.</p>
            <span className="development-badge">VERSIÓN EN DESARROLLO</span>
          </div>
          <div className="sidebar-user">
            <div className="user-avatar">M</div>
            <div className="user-copy"><strong>Mi espacio</strong><small>Sesión local</small></div>
            <span className="user-menu">···</span>
          </div>
        </div>
      </aside>

      {sidebarOpen && <button className="mobile-backdrop" type="button" onClick={() => setSidebarOpen(false)} aria-label="Cerrar menú" />}

      <section className="chat-workspace">
        <header className="chat-topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu-button" type="button" onClick={() => setSidebarOpen(true)} aria-label="Abrir historial">☰</button>
            <div className="topbar-heading">
              <div className="chat-top-title">Laboratorio <span>IA</span></div>
              <div className="chat-top-subtitle"><i /> Asistente electrónico · Prototipo</div>
            </div>
          </div>
          <div className="topbar-actions">
            <button className={`preview-toggle ${previewOpen ? "toggle-on" : ""}`} type="button" onClick={() => setPreviewOpen((open) => !open)} aria-expanded={previewOpen}>
              <span className="preview-toggle-icon">▧</span><span>Vista previa</span>
            </button>
            <span className="topbar-divider" />
            <span className="build-label">BUILD 001</span>
          </div>
        </header>

        <div className="conversation">
          <div className="conversation-scroll" key={activeChat?.id}>
            {activeChat && activeChat.messages.length === 0 ? (
              <div className="welcome-chat">
                <div className="welcome-symbol"><span>ϟ</span><i /></div>
                <div className="welcome-eyebrow">TU LABORATORIO DIGITAL</div>
                <h1>Buenas, ¿qué vamos a <span>crear?</span></h1>
                <p>Diseñá circuitos, explorá componentes y prepará tus proyectos electrónicos desde una sola conversación.</p>
                <div className="suggestion-grid">
                  {starterIdeas.map((idea, index) => (
                    <button key={idea} type="button" className="suggestion-card" onClick={() => setInput(idea)}>
                      <span className="suggestion-icon">{["ϟ", "⌁", "▦"][index]}</span>
                      <span className="suggestion-text">{idea}</span><span className="suggestion-arrow">↗</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="message-list">
                {activeChat?.messages.map((message) => (
                  <article key={message.id} className={`message message-${message.role}`}>
                    <div className={`message-avatar ${message.role === "user" ? "user-message-avatar" : ""}`}>{message.role === "assistant" ? <>M<span>.</span></> : "T"}</div>
                    <div className="message-body">
                      <div className="message-author">{message.role === "assistant" ? "Mathelec" : "Vos"}</div>
                      <p>{message.text}</p>
                    </div>
                  </article>
                ))}
                {isGenerating && <div className="thinking-indicator" role="status" aria-live="polite">
                  <img className="thinking-logo" src="/mathelec-logo.png" alt="" />
                  <div className="thinking-copy"><strong>Mathelect está trabajando</strong><span>Analizando tu pedido y preparando el circuito…</span></div>
                  <time>{generationElapsed.toFixed(1)} s</time>
                </div>}
                <div ref={messageEnd} />
              </div>
            )}
          </div>

          <div className="composer-area">
            {notice && <div className="composer-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Cerrar aviso">×</button></div>}
            {files.length > 0 && <div className="attachment-list">{files.map((file, index) => (
              <div className="attachment-chip" key={`${file.name}-${index}`}><span>▤</span><span className="attachment-name">{file.name}</span><button type="button" onClick={() => removeFile(index)} aria-label={`Quitar ${file.name}`}>×</button></div>
            ))}</div>}

            <form className="composer" onSubmit={(event) => sendMessage(event)}>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="Describí el circuito que querés crear..."
                aria-label="Mensaje para Mathelec"
                rows={2}
              />
              <div className="composer-toolbar">
                <div className="composer-tools">
                  <input ref={fileInput} type="file" multiple hidden accept=".txt,.md,.pdf,.png,.jpg,.jpeg,.webp,.json,.xml,.cir,.sch,.brd,.dsn,.asc,.lw,.pcb,.zip" onChange={selectFiles} />
                  <button type="button" className="composer-tool" onClick={() => fileInput.current?.click()} title="Adjuntar archivos">
                    <span className="attach-plus">＋</span><span>Adjuntar archivo</span>
                  </button>
                  <span className="tool-separator" />
                  <span className="composer-hint">Enter para enviar · Shift + Enter para nueva línea</span>
                </div>
                <div className="composer-actions">
                  <button type="button" className="icon-button mic-button" title="Entrada por voz no implementada" onClick={() => setNotice("El dictado por micrófono todavía no está conectado.")} aria-label="Micrófono">♩</button>
                  <button type="submit" className="send-button" disabled={isGenerating} aria-label="Enviar mensaje" title={isGenerating ? "Generando propuesta..." : "Enviar mensaje"}>{isGenerating ? "…" : "↑"}</button>
                </div>
              </div>
            </form>
            <p className="composer-disclaimer">{isGenerating ? "Preparando respuesta…" : "Revisá las conexiones antes de construir un circuito."}</p>
          </div>
        </div>
      </section>

      {previewOpen && <aside className="preview-sidebar">
        <header className="preview-header">
          <div><div className="preview-eyebrow"><i /> LABORATORIO VISUAL</div><h2>Vista previa</h2></div>
          <button className="icon-button close-preview" type="button" onClick={() => setPreviewOpen(false)} aria-label="Cerrar vista previa" title="Cerrar vista previa">×</button>
        </header>

        <div className="project-file-actions">
          <input ref={projectFileInput} type="file" accept=".json,.mathelect.json,application/json" hidden onChange={loadProjectFile} />
          <input ref={spiceFileInput} type="file" accept=".cir,.net,.sp,.ckt,.txt,text/plain" hidden onChange={importSpiceFile} />
          <button type="button" onClick={saveProjectFile}>Guardar proyecto (.json)</button>
          <button type="button" onClick={() => projectFileInput.current?.click()}>Abrir proyecto (.json)</button>
          <button type="button" onClick={() => spiceFileInput.current?.click()}>Importar netlist SPICE (experimental)</button>
        </div>

        <div className="preview-project">
          <div className="preview-file-icon">⌘</div>
          <div className="preview-project-copy"><strong>Área de circuito</strong><small>Sin archivo generado</small></div>
          <span className="preview-status">DEMO</span>
        </div>

        <div className="preview-tabs" role="tablist" aria-label="Tipo de vista previa">
          {(["Esquema", "PCB", "Protoboard"] as const).map((tab) => (
            <button key={tab} type="button" role="tab" aria-selected={previewTab === tab} className={previewTab === tab ? "preview-tab-active" : ""} onClick={() => setPreviewTab(tab)}>{tab}</button>
          ))}
        </div>

        <div className="preview-canvas">
          <div className="preview-canvas-top"><span>MATHELEC / VIEWER</span><span>100%</span></div>
          
{previewTab === "Esquema" ? (
  <CircuitPreview
    circuit={circuit}
    onMove={handleMoveComponent}
    onConnect={handleConnectTerminals}
    onDeleteWire={handleDeleteWire}
    highlightedComponentIds={selectedValidationIssue?.componentIds ?? []}
    highlightedWireIds={selectedValidationIssue?.wireIds ?? []}
  />
) : (

            <div className="preview-placeholder"><span>{previewTab === "PCB" ? "▦" : "▤"}</span><strong>{previewTab}</strong><p>La vista real estará disponible cuando se implemente el generador de circuitos.</p></div>
          )}
          <div className="preview-canvas-bottom"><span><i /> VISTA DE DEMOSTRACIÓN</span><span>GRID 20 PX</span></div>
        </div>

<div className="preview-details">
  <div className="preview-section-heading">
    <strong>Componentes del circuito</strong>
    <span>{circuit.components.length}</span>
  </div>

  

<div className="component-library">
  {([
    ["Fuentes", [["Batería", "battery"], ["Fuente CA", "voltage_source_ac"], ["Fuente de corriente", "current_source"], ["Tierra", "ground"]]],
    ["Pasivos", [["Resistencia", "resistor"], ["Potenciómetro", "potentiometer"], ["Capacitor", "capacitor"], ["Capacitor polarizado", "polarized_capacitor"], ["Inductor", "inductor"]]],
    ["Diodos y sensores", [["LED", "led"], ["Diodo", "diode"], ["Zener", "zener_diode"], ["Fotodiodo", "photodiode"], ["LDR", "ldr"], ["Termistor", "thermistor"]]],
    ["Control y protección", [["Interruptor", "switch"], ["Pulsador", "push_button"], ["Fusible", "fuse"], ["Relé", "relay"]]],
    ["Semiconductores", [["Transistor NPN", "npn_transistor"], ["Transistor PNP", "pnp_transistor"], ["MOSFET N", "mosfet_n"], ["MOSFET P", "mosfet_p"], ["Amplificador operacional", "op_amp"]]],
    ["Lógica e integrados", [["Puerta AND", "logic_gate_and"], ["Puerta OR", "logic_gate_or"], ["Puerta NOT", "logic_gate_not"], ["NE555", "ic_555"], ["CD4017", "ic_4017"]]],
    ["Salidas y conexión", [["Motor", "motor"], ["Lámpara", "lamp"], ["Conector", "connector"]]]
  ] as [string, [string, ComponentType][]][]).map(([category, items]) => (
    <section className="component-library-group" key={category}>
      <strong>{category}</strong>
      <div className="component-actions">
        {items.map(([label, type]) => (
          <button key={type} type="button" onClick={() => handleAddComponent(type)}>
            <span className="component-button-symbol" aria-hidden="true">{({battery:"＋", voltage_source_ac:"∿", current_source:"↗", ground:"⏚", resistor:"Ω", potentiometer:"↗", capacitor:"Ⅱ", polarized_capacitor:"＋Ⅱ", inductor:"∿", led:"◉", diode:"▷", zener_diode:"▷", photodiode:"☼", ldr:"☼", thermistor:"♨", switch:"／", push_button:"●", fuse:"▱", relay:"K", npn_transistor:"NPN", pnp_transistor:"PNP", mosfet_n:"N", mosfet_p:"P", op_amp:"△", logic_gate_and:"&", logic_gate_or:"≥1", logic_gate_not:"¬", ic_555:"555", ic_4017:"4017", motor:"M", lamp:"☼", connector:"J"} as Record<ComponentType, string>)[type]}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>
    </section>
  ))}
</div>


  {circuit.components.length === 0 ? (
    <p>Todavía no agregaste componentes.</p>
  ) : (
    circuit.components.map((component) => (
      <div className="detail-row" key={component.id}>
        <span>{component.label} · {component.type}</span>
        <button
          type="button"
          onClick={() => handleRemoveComponent(component.id)}
          aria-label={`Eliminar ${component.label}`}
        >
          Eliminar
        </button>
      </div>
    ))
  )}

  {validationIssues.length > 0 && (
    <div>
      <strong>Revisión estructural</strong>
      {validationIssues.map((issue, index) => {
        const selected = selectedValidationIssue === issue;
        return (
          <button
            key={`${issue.code}-${index}`}
            type="button"
            className={selected ? "validation-issue validation-issue-selected" : "validation-issue"}
            onClick={() => setSelectedValidationIssue(selected ? null : issue)}
            aria-pressed={selected}
          >
            <span aria-hidden="true">{issue.severity === "error" ? "❌" : issue.severity === "info" ? "ℹ️" : "⚠️"}</span>
            <span>{issue.message}</span>
            <small>{issue.componentIds?.length || issue.wireIds?.length ? "Localizar" : "Aviso"}</small>
          </button>
        );
      })}
    </div>
  )}
</div>


        <div className="preview-warning"><span>ⓘ</span><p>Esta imagen es ilustrativa, no representa un circuito calculado ni validado. Todavía no se ha generado un archivo descargable.</p></div>
        <div className="preview-bottom">
          <button className="export-button" type="button" onClick={exportCircuitSvg}><span>↓</span> Exportar esquema SVG</button>
          <button className="export-button" type="button" onClick={exportConnectionReport}>Exportar conexiones (.txt)</button>
          <small>Exportaciones informativas; no son archivos nativos de simulación.</small>
        </div>
      </aside>}
    </main>
  );
}
