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
  Clock,
  User,
} from "lucide-react";
import { getApiKey } from "../syncService";

const API_BASE_URL = "https://vericelgregory.alwaysdata.net/piscine/api";

const PIN_TYPES = {
  extincteur: { label: "Extincteur", icon: Flame, color: "#ef4444" },
  baes: { label: "BAES / Éclairage de secours", icon: Lightbulb, color: "#10b981" },
  desenfumage: { label: "Commande Désenfumage", icon: Wind, color: "#3b82f6" },
  coupure: { label: "Arrêt d'urgence / Coupure", icon: Zap, color: "#f59e0b" },
  issue: { label: "Issue de secours", icon: DoorOpen, color: "#8b5cf6" },
};

export default function InteractivePlan({
  tasks = [],
  initialLayer = "extincteur",
  onStatusChange,
  onClose,
}) {
  const [activeLayer, setActiveLayer] = useState(initialLayer);
  const [pins, setPins] = useState(() => {
    const cached = localStorage.getItem("pool_plan_pins");
    return cached ? JSON.parse(cached) : [];
  });

  // Mémorisation des statuts propres aux pastilles pour le mois en cours
  const [pinStates, setPinStates] = useState(() => {
    const cached = localStorage.getItem("pool_pin_states");
    return cached ? JSON.parse(cached) : {};
  });

  const [selectedPin, setSelectedPin] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newPinType, setNewPinType] = useState(initialLayer === "all" ? "extincteur" : initialLayer);
  const [zoom, setZoom] = useState(1);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });

  // Édition de réserve
  const [isEditingReserve, setIsEditingReserve] = useState(false);
  const [reserveNote, setReserveNote] = useState("");

  const containerRef = useRef(null);
  const apiKey = getApiKey();
  const currentUser = localStorage.getItem("pool_user") || "Technicien";

  const handleMouseMove = (e) => {
    if (!isAdding) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (((e.clientX - rect.left) / rect.width) * 100).toFixed(1);
    const y = (((e.clientY - rect.top) / rect.height) * 100).toFixed(1);
    setCursorPos({ x: parseFloat(x), y: parseFloat(y) });
  };

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
        // Mode hors-ligne
      }
    }
    fetchPins();
    return () => {
      isMounted = false;
    };
  }, [apiKey]);

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
      console.warn("Synchronisation réseau différée :", e);
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
    const confirmation = prompt(
      "ZONE SÉCURISÉE : Tapez 'SUPPRIMER' pour confirmer le retrait définitif de cette pastille :"
    );
    if (confirmation !== "SUPPRIMER") {
      alert("Action annulée. La pastille n'a pas été supprimée.");
      return;
    }
    persistPins(pins.filter((p) => p.id !== pinId));
    setSelectedPin(null);
  };

  const handleSetStatus = (pin, status, note = "") => {
    const now = new Date().toISOString();
    const updatedStates = {
      ...pinStates,
      [pin.id]: {
        status,
        note,
        updatedBy: currentUser,
        completedAt: now,
      },
    };
    setPinStates(updatedStates);
    localStorage.setItem("pool_pin_states", JSON.stringify(updatedStates));

    // Si une tâche liée existe dans la liste globale, on la met à jour
    const matchingTask = tasks.find(
      (t) =>
        t.title.toLowerCase().includes(pin.title.toLowerCase()) ||
        pin.title.toLowerCase().includes(t.title.toLowerCase())
    );
    if (matchingTask && onStatusChange) {
      onStatusChange(matchingTask.id, status);
    }

    setIsEditingReserve(false);
    setReserveNote("");
  };

  const visiblePins = activeLayer === "all" ? pins : pins.filter((p) => p.type === activeLayer);

  const getPinInfo = (pin) => {
    const state = pinStates[pin.id];
    if (state) {
      if (state.status === "FAIT") return { status: "FAIT", color: "#22c55e", state };
      if (state.status === "RESERVE") return { status: "RESERVE", color: "#f59e0b", state };
    }

    // Secours sur la liste des tâches
    const task = tasks.find(
      (t) =>
        t.title.toLowerCase().includes(pin.title.toLowerCase()) ||
        pin.title.toLowerCase().includes(t.title.toLowerCase())
    );
    if (task && task.status === "FAIT") return { status: "FAIT", color: "#22c55e", state: task };
    if (task && task.status === "RESERVE") return { status: "RESERVE", color: "#f59e0b", state: task };

    return { status: "A_FAIRE", color: PIN_TYPES[pin.type]?.color || "#ef4444", state: null };
  };

  const activePinInfo = selectedPin ? getPinInfo(selectedPin) : null;

  return (
    <div className="interactive-plan-overlay">
      <div className="interactive-plan-modal">
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
                onClick={() => setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                className="interactive-plan-zoom-button"
                title="Zoomer"
              >
                <ZoomIn size={16} />
              </button>
              <span className="interactive-plan-zoom-level">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.max(1, Number((z - 0.25).toFixed(2))))}
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

            <button onClick={onClose} className="interactive-plan-close-button">
              <X size={22} />
            </button>
          </div>
        </div>

        {/* ONGLETS DES CALQUES */}
        <div className="interactive-plan-layer-tabs">
          <span className="interactive-plan-layer-label">Calque :</span>

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
              {isAdding ? "Quitter mode placement" : "Mode placement / admin"}
            </button>
          </div>
        </div>

        {/* AFFICHAGE DU PLAN */}
        <div ref={containerRef} className="interactive-plan-viewport">
          <div
            onClick={handleImageClick}
            onMouseMove={handleMouseMove}
            className={`interactive-plan-canvas ${isAdding ? "is-adding-mode" : ""}`}
            style={{
              width: `${zoom * 100}%`,
              maxWidth: zoom === 1 ? "100%" : "none",
            }}
          >
            {isAdding && (
              <div className="interactive-plan-coords-badge">
                Mode placement actif : X {cursorPos.x}% | Y {cursorPos.y}% (cliquez pour poser un point)
              </div>
            )}

            <img
              src="./plans/plan_niveau_0.png"
              alt="Plan Niveau 0"
              className="interactive-plan-image"
            />

            {visiblePins.map((pin) => {
              const { color } = getPinInfo(pin);
              const PinIcon = PIN_TYPES[pin.type]?.icon || Circle;

              return (
                <div
                  key={pin.id}
                  onClick={(e) => {
                    if (isAdding) return;
                    e.stopPropagation();
                    setSelectedPin(pin);
                    setIsEditingReserve(false);
                  }}
                  className={`interactive-plan-pin ${isAdding ? "is-disabled-placement" : ""}`}
                  style={{
                    left: `${pin.x}%`,
                    top: `${pin.y}%`,
                    backgroundColor: color,
                    zIndex: selectedPin?.id === pin.id ? 30 : 10,
                  }}
                  title={pin.title}
                >
                  <PinIcon size={12} color="#ffffff" />
                </div>
              );
            })}
          </div>
        </div>

        {/* TIROIR D'ACTION DU POINT SÉLECTIONNÉ */}
        {selectedPin && (
          <div className="interactive-plan-action-drawer">
            <div className="interactive-plan-selected-info">
              <div className="interactive-plan-selected-meta">
                <span className="interactive-plan-selected-type">
                  {PIN_TYPES[selectedPin.type]?.label}
                </span>

                {/* Badge du statut en cours */}
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: "4px",
                    fontSize: "0.75rem",
                    fontWeight: "bold",
                    color: "#ffffff",
                    backgroundColor: activePinInfo.color,
                  }}
                >
                  {activePinInfo.status === "FAIT"
                    ? "✓ Conforme"
                    : activePinInfo.status === "RESERVE"
                    ? "⚠ Réserve en cours"
                    : "À contrôler"}
                </span>

                <span className="interactive-plan-selected-coordinates">
                  X: {selectedPin.x}% / Y: {selectedPin.y}%
                </span>
              </div>

              <div className="interactive-plan-selected-title">
                {selectedPin.title}
              </div>

              {/* Historique de vérification */}
              {activePinInfo.state && (
                <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "4px", display: "flex", gap: "12px" }}>
                  {activePinInfo.state.updatedBy && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <User size={13} /> {activePinInfo.state.updatedBy}
                    </span>
                  )}
                  {activePinInfo.state.completedAt && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <Clock size={13} /> {new Date(activePinInfo.state.completedAt).toLocaleString("fr-FR")}
                    </span>
                  )}
                </div>
              )}

              {/* Affichage de la réserve existante */}
              {activePinInfo.state?.note && (
                <div style={{ fontSize: "0.8rem", color: "#b45309", background: "#fef3c7", padding: "4px 8px", borderRadius: "4px", marginTop: "6px" }}>
                  <strong>Anomalie :</strong> {activePinInfo.state.note}
                </div>
              )}
            </div>

            {/* Saisie de réserve si demandée */}
            {isEditingReserve ? (
              <div style={{ width: "100%", marginTop: "10px", display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="text"
                  value={reserveNote}
                  onChange={(e) => setReserveNote(e.target.value)}
                  placeholder="Préciser l'anomalie (ex: goupille manquante, pression basse...)"
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid #f59e0b",
                    fontSize: "0.85rem",
                  }}
                  autoFocus
                />
                <button
                  onClick={() => handleSetStatus(selectedPin, "RESERVE", reserveNote)}
                  style={{
                    backgroundColor: "#f59e0b",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    padding: "8px 14px",
                    fontWeight: "bold",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  Valider réserve
                </button>
                <button
                  onClick={() => setIsEditingReserve(false)}
                  style={{
                    background: "#f1f5f9",
                    color: "#64748b",
                    border: "none",
                    borderRadius: "6px",
                    padding: "8px 12px",
                    cursor: "pointer",
                  }}
                >
                  Annuler
                </button>
              </div>
            ) : (
              <div className="interactive-plan-action-buttons">
                <button
                  onClick={() => handleSetStatus(selectedPin, "FAIT")}
                  className="interactive-plan-status-button is-done"
                >
                  <CheckCircle2 size={16} /> Conforme (Fait)
                </button>

                <button
                  onClick={() => setIsEditingReserve(true)}
                  className="interactive-plan-status-button is-reserved"
                >
                  <AlertTriangle size={16} /> Signaler une réserve
                </button>

                {/* Bouton de suppression protégé : visible seulement si le mode ajout/admin est actif */}
                {isAdding && (
                  <button
                    onClick={() => handleDeletePin(selectedPin.id)}
                    className="interactive-plan-delete-button"
                    title="Supprimer définitivement cette pastille (Mode Admin)"
                  >
                    <Trash2 size={16} /> Supprimer
                  </button>
                )}

                <button
                  onClick={() => {
                    setSelectedPin(null);
                    setIsEditingReserve(false);
                  }}
                  className="interactive-plan-dismiss-button"
                >
                  Fermer
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}