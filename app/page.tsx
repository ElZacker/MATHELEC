"use client";

import { useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";

import {
  addComponent,
  createCircuit,
  connectTerminals,
  disconnectWire,
  removeComponent,
} from "@/lib/circuits/circuit-model";


import { validateCircuit } from "@/lib/circuits/validation";

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

const welcomeMessage = (): Message => ({
  id: "welcome",
  role: "assistant",
  text: "¡Hola! Soy Mathelect, tu espacio de trabajo para electrónica. Describí el circuito que querés diseñar o adjuntá un archivo para comenzar. La generación y validación electrónica mediante IA todavía no está conectada.",
});

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
    messages: [welcomeMessage()],
  }]);
  const [activeChatId, setActiveChatId] = useState("chat-inicial");
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  
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
  const messageEnd = useRef<HTMLDivElement>(null);
  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? chats[0];

  function newChat() {
    const id = crypto.randomUUID();
    const chat: Chat = {
      id,
      title: "Nuevo proyecto",
      messages: [{
        id: crypto.randomUUID(),
        role: "assistant",
        text: "Nuevo espacio listo. Contame qué circuito querés diseñar o adjuntá un archivo. El análisis real se conectará en una etapa posterior.",
      }],
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

    const userMessage: Message = { id: crypto.randomUUID(), role: "user", text: content };
    setChats((current) => current.map((chat) => chat.id === activeChat.id ? {
      ...chat,
      title: chat.title === "Nuevo proyecto" ? content.slice(0, 38) : chat.title,
      messages: [...chat.messages, userMessage],
    } : chat));
    setInput("");
    setNotice("");
    setIsGenerating(true);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: content }),
      });
      const data: {
        mode?: "demo" | "ai";
        title?: string; explanation?: string;
        components?: { type: ComponentType; x: number; y: number }[];
        wires?: { from: { componentIndex: number; terminalId: string }; to: { componentIndex: number; terminalId: string } }[];
        confirmedRequirements?: string[]; assumptions?: string[];
        missingInformation?: string[]; warnings?: string[]; error?: string;
      } = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudo generar la propuesta.");

      let assistantText = [
        data.title ?? "Propuesta recibida",
        data.mode === "ai" ? "Modo IA: respuesta generada por el proveedor configurado." : "Modo demostración: todavía no se configuró una clave de IA.",
        data.explanation ?? "",
        data.confirmedRequirements?.length ? "Requisitos identificados:\n- " + data.confirmedRequirements.join("\n- ") : "",
        data.assumptions?.length ? "Suposiciones:\n- " + data.assumptions.join("\n- ") : "",
        data.missingInformation?.length ? "Datos pendientes:\n- " + data.missingInformation.join("\n- ") : "",
        data.warnings?.length ? "Advertencias:\n- " + data.warnings.join("\n- ") : "",
      ].filter(Boolean).join("\n\n");

      if (data.components?.length) {
        let nextCircuit = createCircuit(content.slice(0, 60) || "Propuesta de circuito");
        const componentIds: string[] = [];
        for (const item of data.components) {
          if (!["battery", "resistor", "led", "switch", "ground"].includes(item.type)) {
            throw new Error("La propuesta contiene un tipo de componente no admitido.");
          }
          nextCircuit = addComponent(nextCircuit, item.type, item.x, item.y);
          componentIds.push(nextCircuit.components[nextCircuit.components.length - 1].id);
        }
        for (const wire of data.wires ?? []) {
          const fromId = componentIds[wire.from.componentIndex];
          const toId = componentIds[wire.to.componentIndex];
          if (!fromId || !toId) throw new Error("La propuesta contiene índices de conexión inválidos.");
          nextCircuit = connectTerminals(nextCircuit, fromId, wire.from.terminalId, toId, wire.to.terminalId);
        }
        const issues = validateCircuit(nextCircuit);
        setCircuit(nextCircuit);
        setValidationIssues(issues);
        setSelectedValidationIssue(null);
        assistantText += "\n\nSe cargó una propuesta en el área de circuito. Revisá las advertencias antes de usarla.";
        if (issues.length) assistantText += "\nEl verificador estructural encontró " + issues.length + " aviso(s).";
      } else {
        setNotice("La propuesta no incluyó componentes para dibujar.");
      }

      const assistantMessage: Message = { id: crypto.randomUUID(), role: "assistant", text: assistantText };
      setChats((current) => current.map((chat) => chat.id === activeChat.id
        ? { ...chat, messages: [...chat.messages, assistantMessage] } : chat));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Ocurrió un error inesperado.";
      setChats((current) => current.map((chat) => chat.id === activeChat.id
        ? { ...chat, messages: [...chat.messages, { id: crypto.randomUUID(), role: "assistant", text: "No se pudo generar la propuesta: " + errorMessage }] } : chat));
    } finally {
      setIsGenerating(false);
      requestAnimationFrame(() => messageEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
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
            {activeChat && activeChat.messages.length <= 1 ? (
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
            <p className="composer-disclaimer">{isGenerating ? "Preparando una propuesta de demostración..." : "Generador en modo demostración. Verificá las advertencias antes de construir un circuito."}</p>
          </div>
        </div>
      </section>

      {previewOpen && <aside className="preview-sidebar">
        <header className="preview-header">
          <div><div className="preview-eyebrow"><i /> LABORATORIO VISUAL</div><h2>Vista previa</h2></div>
          <button className="icon-button close-preview" type="button" onClick={() => setPreviewOpen(false)} aria-label="Cerrar vista previa" title="Cerrar vista previa">×</button>
        </header>

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

  

<div className="component-actions">
  <button type="button" onClick={() => handleAddComponent("battery")}>
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="5" width="10" height="14" rx="2" />
      <path d="M10 3v2M14 3v2M10 10h4M12 8v4M10 15h4" />
    </svg>
    <span>Batería</span>
  </button>

  <button type="button" onClick={() => handleAddComponent("resistor")}>
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12h4l2-4 4 8 4-8 2 4h4" />
    </svg>
    <span>Resistencia</span>
  </button>

  <button type="button" onClick={() => handleAddComponent("led")}>
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 9a4 4 0 0 1 8 0c0 2-2 3-2 5h-4c0-2-2-3-2-5Z" />
      <path d="M10 17h4M10 20h4M17 4l2-2M19 8h3M5 5 3 3" />
    </svg>
    <span>LED</span>
  </button>

  <button type="button" onClick={() => handleAddComponent("switch")}>
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="15" r="2" />
      <circle cx="19" cy="15" r="2" />
      <path d="M7 14l9-7" />
    </svg>
    <span>Interruptor</span>
  </button>
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
          <button className="export-button" type="button" onClick={() => setNotice("La exportación se habilitará cuando el generador de circuitos esté implementado.")}><span>↓</span> Exportar circuito</button>
          <small>Formatos previstos: Livewire · Proteus · PCB</small>
        </div>
      </aside>}
    </main>
  );
}
