import { useState, useEffect, useRef } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  X,
  Flame,
  Wind,
  Zap,
  Lightbulb,
  DoorOpen,
  Plus,
  Trash2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Circle,
} from "lucide-react";
import { getApiKey } from "../syncService";

const API_BASE_URL = "https://vericelgregory.alwaysdata.net/piscine/api";

// Constante locale au composant (sans export pour satisfaire React Fast Refresh)
const PIN_TYPES = {
  extincteur: { label: "Extincteur", icon: Flame, color: "#ef4444" },
  baes: { label: "BAES / Éclairage de secours", icon: Lightbulb, color: "#10b981" },
  desenfumage: { label: "Commande Désenfumage", icon: Wind, color: "#3b82f6" },
  coupure: { label: "Arrêt d'urgence / Coupure", icon: Zap, color: "#f59e0b" },
  issue: { label: "Issue de secours", icon: DoorOpen, color: "#8b5cf6" },
};

const DEFAULT_PINS = [
  { id: "ext_1", type: "extincteur", title: "Extincteur n°1 — Hall Accueil", x: 63.5, y: 36.8 },
  { id: "ext_2", type: "extincteur", title: "Extincteur n°2 — Dégagement Vestiaires", x: 54.2, y: 45.1 },
  { id: "ext_3", type: "extincteur", title: "Extincteur n°3 — Local Chaufferie", x: 82.5, y: 81.2 },
  { id: "baes_1", type: "baes", title: "BAES Sortie Principale Hall", x: 61.2, y: 32.1 },
  { id: "des_1", type: "desenfumage", title: "Désenfumage — Circulation Vestiaires", x: 69.8, y: 33.5 },
  { id: "coup_1", type: "coupure", title: "Coupure Gaz Chaufferie", x: 82.0, y: 85.0 },
];

export default function InteractivePlan({
  tasks = [],
  initialLayer = "extincteur",
  onStatusChange,
  onClose,
}) {
  const [activeLayer, setActiveLayer] = useState(initialLayer);
  const [pins, setPins] = useState(() => {
    const cached = localStorage.getItem("pool_plan_pins");
    return cached ? JSON.parse(cached) : DEFAULT_PINS;
  });

  const [selectedPin, setSelectedPin] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newPinType, setNewPinType] = useState(initialLayer === "all" ? "extincteur" : initialLayer);
  const [zoom, setZoom] = useState(1);

  const containerRef = useRef(null);
  const apiKey = getApiKey();

  // Chargement des pastilles depuis Alwaysdata
  useEffect(() => {
    let isMounted = true;

    async function fetchPins() {
      try {
        const res = await fetch(`${API_BASE_URL}/plan-pins`, {
          headers: { "X-API-KEY": apiKey },
        });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && Array.isArray(data) && data.length > 0) {
            setPins(data);
            localStorage.setItem("pool_plan_pins", JSON.stringify(data));
          }
        }
      } catch {
        // Mode hors-ligne : conserve les pastilles en cache local
      }
    }

    fetchPins();

    return () => {
      isMounted = false;
    };
  }, [apiKey]);

  // Synchronisation des pastilles vers le serveur
  const persistPins = async (updatedPins) => {
    setPins(updatedPins);
    localStorage.setItem("pool_plan_pins", JSON.stringify(updatedPins));

    try {
      await fetch(`${API_BASE_URL}/plan-pins`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": apiKey,
        },
        body: JSON.stringify(updatedPins),
      });
    } catch (e) {
      console.warn("Synchronisation réseau différée pour les pastilles :", e);
    }
  };

  const handleSelectLayer = (layer) => {
    setActiveLayer(layer);
    if (layer !== "all") {
      setNewPinType(layer);
    }
  };

  const handleImageClick = (e) => {
    if (!isAdding) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = parseFloat((((e.clientX - rect.left) / rect.width) * 100).toFixed(1));
    const y = parseFloat((((e.clientY - rect.top) / rect.height) * 100).toFixed(1));

    const defaultTitle = `${PIN_TYPES[newPinType]?.label || "Point"} n°${
      pins.filter((p) => p.type === newPinType).length + 1
    }`;
    const title = prompt("Intitulé de l'organe de sécurité :", defaultTitle);
    if (!title || !title.trim()) return;

    const newPin = {
      id: "pin_" + Date.now(),
      type: newPinType,
      title: title.trim(),
      x,
      y,
    };

    persistPins([...pins, newPin]);
    setIsAdding(false);
  };

  const handleDeletePin = (pinId) => {
    if (!window.confirm("Supprimer cette pastille du plan pour tous les agents ?")) return;
    persistPins(pins.filter((p) => p.id !== pinId));
    setSelectedPin(null);
  };

  const visiblePins = activeLayer === "all" ? pins : pins.filter((p) => p.type === activeLayer);

  const getPinStatus = (pin) => {
    const task = tasks.find(
      (t) =>
        t.title.toLowerCase().includes(pin.title.toLowerCase()) ||
        pin.title.toLowerCase().includes(t.title.toLowerCase())
    );

    if (!task) return { status: "A_FAIRE", color: PIN_TYPES[pin.type]?.color || "#ef4444", task: null };
    if (task.status === "FAIT") return { status: "FAIT", color: "#22c55e", task };
    if (task.status === "RESERVE") return { status: "RESERVE", color: "#f59e0b", task };
    return { status: "A_FAIRE", color: "#ef4444", task };
  };

  return (
    <div
      className="interactive-plan-overlay"
    >
      <div
        className="interactive-plan-modal"
      >
        {/* EN-TÊTE */}
        <div className="interactive-plan-header">
          <div>
            <h3 className="interactive-plan-title">
              Plan de sécurité interactif — Niveau 0
            </h3>
            <span className="interactive-plan-count">
              {visiblePins.length} point(s) affiché(s) sur ce calque
            </span>
          </div>

          <div className="interactive-plan-header-actions">
            <div className="interactive-plan-zoom-controls">
              <button
                onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))}
                className="interactive-plan-zoom-button"
                title="Zoomer"
              >
                <ZoomIn size={16} />
              </button>
              <button
                onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
                className="interactive-plan-zoom-button"
                title="Dézoomer"
              >
                <ZoomOut size={16} />
              </button>
              <button
                onClick={() => setZoom(1)}
                className="interactive-plan-zoom-button"
                title="Réinitialiser le zoom"
              >
                <RotateCcw size={16} />
              </button>
            </div>

            <button
              onClick={onClose}
              className="interactive-plan-close-button"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {/* ONGLETS DES CALQUES */}
        <div className="interactive-plan-layer-tabs">
          <span className="interactive-plan-layer-label">
            Calque :
          </span>

          <button
            onClick={() => handleSelectLayer("extincteur")}
            className={`interactive-plan-layer-tab ${activeLayer === "extincteur" ? "is-active" : ""}`}
            style={{ "--layer-color": "#ef4444" }}
          >
            <Flame size={15} /> Extincteurs ({pins.filter((p) => p.type === "extincteur").length})
          </button>

          <button
            onClick={() => handleSelectLayer("baes")}
            className={`interactive-plan-layer-tab ${activeLayer === "baes" ? "is-active" : ""}`}
            style={{ "--layer-color": "#10b981" }}
          >
            <Lightbulb size={15} /> BAES / Éclairage ({pins.filter((p) => p.type === "baes").length})
          </button>

          <button
            onClick={() => handleSelectLayer("desenfumage")}
            className={`interactive-plan-layer-tab ${activeLayer === "desenfumage" ? "is-active" : ""}`}
            style={{ "--layer-color": "#3b82f6" }}
          >
            <Wind size={15} /> Désenfumage ({pins.filter((p) => p.type === "desenfumage").length})
          </button>

          <button
            onClick={() => handleSelectLayer("coupure")}
            className={`interactive-plan-layer-tab ${activeLayer === "coupure" ? "is-active" : ""}`}
            style={{ "--layer-color": "#f59e0b" }}
          >
            <Zap size={15} /> Coupures Élec / Gaz ({pins.filter((p) => p.type === "coupure").length})
          </button>

          <button
            onClick={() => handleSelectLayer("all")}
            className={`interactive-plan-layer-tab ${activeLayer === "all" ? "is-active" : ""}`}
            style={{ "--layer-color": "#475569" }}
          >
            Tout afficher ({pins.length})
          </button>

          <div className="interactive-plan-add-wrapper">
            <button
              onClick={() => setIsAdding(!isAdding)}
              className={`interactive-plan-add-button ${isAdding ? "is-adding" : ""}`}
            >
              <Plus size={15} />
              {isAdding ? "Annuler placement" : `Ajouter un ${PIN_TYPES[newPinType]?.label || "point"}`}
            </button>
          </div>
        </div>

        {/* AFFICHAGE DU PLAN */}
        <div
          ref={containerRef}
          className="interactive-plan-viewport"
        >
          <div
            onClick={handleImageClick}
            className="interactive-plan-canvas"
            style={{ transform: `scale(${zoom})`, cursor: isAdding ? "crosshair" : "default" }}
          >
            <img
              src="./plans/plan_niveau_0.png"
              alt="Plan Niveau 0"
              className="interactive-plan-image"
            />

            {visiblePins.map((pin) => {
              const { color } = getPinStatus(pin);
              const PinIcon = PIN_TYPES[pin.type]?.icon || Circle;

              return (
                <div
                  key={pin.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPin(pin);
                  }}
                  className="interactive-plan-pin"
                  style={{
                    left: `${pin.x}%`,
                    top: `${pin.y}%`,
                    backgroundColor: color,
                    zIndex: selectedPin?.id === pin.id ? 30 : 10,
                  }}
                  title={pin.title}
                >
                  <PinIcon size={13} color="#ffffff" />
                </div>
              );
            })}
          </div>
        </div>

        {/* TIROIR D'ACTION */}
        {selectedPin && (
          <div className="interactive-plan-action-drawer">
            <div className="interactive-plan-selected-info">
              <div className="interactive-plan-selected-meta">
                <span className="interactive-plan-selected-type">
                  {PIN_TYPES[selectedPin.type]?.label}
                </span>
                <span className="interactive-plan-selected-coordinates">
                  X: {selectedPin.x}% / Y: {selectedPin.y}%
                </span>
              </div>
              <div className="interactive-plan-selected-title">
                {selectedPin.title}
              </div>
            </div>

            <div className="interactive-plan-action-buttons">
              <button
                onClick={() => {
                  const { task } = getPinStatus(selectedPin);
                  if (task && onStatusChange) {
                    onStatusChange(task.id, "FAIT");
                  }
                  setSelectedPin(null);
                }}
                className="interactive-plan-status-button is-done"
              >
                <CheckCircle2 size={16} /> Conforme (Fait)
              </button>

              <button
                onClick={() => {
                  const { task } = getPinStatus(selectedPin);
                  if (task && onStatusChange) {
                    onStatusChange(task.id, "RESERVE");
                  }
                  setSelectedPin(null);
                }}
                className="interactive-plan-status-button is-reserved"
              >
                <AlertTriangle size={16} /> Réserve
              </button>

              <button
                onClick={() => handleDeletePin(selectedPin.id)}
                className="interactive-plan-delete-button"
                title="Supprimer cette pastille"
              >
                <Trash2 size={16} />
              </button>

              <button
                onClick={() => setSelectedPin(null)}
                className="interactive-plan-dismiss-button"
              >
                Fermer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

