import { useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  X,
  Flame,
  Wind,
  Zap,
  Info,
} from "lucide-react";

// Points initiaux repérés sur le plan Niveau 0 (coordonnées en %)
const DEFAULT_PINS = [
  {
    id: "pin_ext_hall",
    taskId: null, // Sera lié dynamiquement ou restera repéré
    title: "Extincteur — Hall Accueil",
    type: "extincteur",
    x: 63.5,
    y: 36.8,
  },
  {
    id: "pin_ext_vestiaires",
    taskId: null,
    title: "Extincteur — Dégagement Vestiaires",
    type: "extincteur",
    x: 54.2,
    y: 45.1,
  },
  {
    id: "pin_ext_chaufferie",
    taskId: null,
    title: "Extincteur — Local Chaufferie",
    type: "extincteur",
    x: 82.5,
    y: 81.2,
  },
  {
    id: "pin_desenf_circul",
    taskId: null,
    title: "Commande Désenfumage — Circulation",
    type: "desenfumage",
    x: 69.8,
    y: 33.5,
  },
  {
    id: "pin_coupure_gaz",
    taskId: null,
    title: "Arrêt d'urgence / Coupure Gaz",
    type: "gaz",
    x: 62.1,
    y: 28.5,
  },
];

export default function InteractivePlan({
  tasks = [],
  onStatusChange,
  onClose,
}) {
  const [pins, setPins] = useState(DEFAULT_PINS);
  const [selectedPin, setSelectedPin] = useState(null);
  const [calibrationMode, setCalibrationMode] = useState(false);

  // Clic sur l'image pour le mode étalonnage
  const handleImageClick = (e) => {
    if (!calibrationMode) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = (((e.clientX - rect.left) / rect.width) * 100).toFixed(1);
    const y = (((e.clientY - rect.top) / rect.height) * 100).toFixed(1);

    const title = prompt("Titre de ce nouveau point de contrôle :", "Extincteur n°...");
    if (!title) return;

    const newPin = {
      id: "pin_" + Date.now(),
      taskId: null,
      title: title.trim(),
      type: "extincteur",
      x: parseFloat(x),
      y: parseFloat(y),
    };

    setPins((prev) => [...prev, newPin]);
    console.log("Nouveau Pin généré :", newPin);
  };

  const getPinColor = (pin) => {
    // Si lié à une tâche existante
    const task = tasks.find((t) => t.id === pin.taskId || t.title.toLowerCase().includes(pin.title.toLowerCase()));
    if (!task) return "#3b82f6"; // Bleu par défaut
    if (task.status === "FAIT") return "#22c55e"; // Vert
    if (task.status === "RESERVE") return "#f59e0b"; // Orange
    return "#ef4444"; // Rouge à faire
  };

  const getPinIcon = (type) => {
    switch (type) {
      case "extincteur":
        return <Flame size={12} color="#ffffff" />;
      case "desenfumage":
        return <Wind size={12} color="#ffffff" />;
      case "gaz":
        return <Zap size={12} color="#ffffff" />;
      default:
        return <Info size={12} color="#ffffff" />;
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        flexDirection: "column",
        zIndex: 9999,
        padding: "12px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "14px",
          width: "100%",
          maxWidth: "1050px",
          margin: "0 auto",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)",
        }}
      >
        {/* EN-TÊTE DU PLAN */}
        <div
          style={{
            padding: "12px 18px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "10px",
            backgroundColor: "#f8fafc",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: "1.1rem", color: "#0f172a" }}>
              Plan d'évacuation & Organes de sécurité — Niveau 0
            </h3>
            <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
              Cliquez ou touchez une pastille pour valider le contrôle
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={() => setCalibrationMode(!calibrationMode)}
              style={{
                backgroundColor: calibrationMode ? "#fee2e2" : "#f1f5f9",
                color: calibrationMode ? "#b91c1c" : "#475569",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                padding: "6px 12px",
                fontSize: "0.78rem",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              {calibrationMode ? "Mode Placement ACTIF" : "Placer un point"}
            </button>

            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: "#64748b",
                cursor: "pointer",
                padding: "4px",
              }}
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {/* CONTENEUR DU PLAN AVEC PASTILLES INTERACTIVES */}
        <div
          style={{
            flex: 1,
            position: "relative",
            overflow: "auto",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "#0f172a",
            padding: "10px",
          }}
        >
          <div
            onClick={handleImageClick}
            style={{
              position: "relative",
              maxWidth: "100%",
              maxHeight: "100%",
              display: "inline-block",
              userSelect: "none",
              cursor: calibrationMode ? "crosshair" : "default",
            }}
          >
            <img
              src="./plans/plan_niveau_0.png"
              alt="Plan de sécurité Niveau 0"
              style={{
                maxWidth: "100%",
                maxHeight: "75vh",
                objectFit: "contain",
                display: "block",
                borderRadius: "8px",
              }}
            />

            {/* AFFICHAGE DES PASTILLES */}
            {pins.map((pin) => {
              const color = getPinColor(pin);
              return (
                <div
                  key={pin.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPin(pin);
                  }}
                  style={{
                    position: "absolute",
                    left: `${pin.x}%`,
                    top: `${pin.y}%`,
                    transform: "translate(-50%, -50%)",
                    backgroundColor: color,
                    border: "2px solid #ffffff",
                    borderRadius: "50%",
                    width: "24px",
                    height: "24px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 5px rgba(0,0,0,0.4)",
                    cursor: "pointer",
                    transition: "transform 0.15s ease",
                    zIndex: 10,
                  }}
                  title={pin.title}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = "translate(-50%, -50%) scale(1.25)")}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = "translate(-50%, -50%) scale(1)")}
                >
                  {getPinIcon(pin.type)}
                </div>
              );
            })}
          </div>
        </div>

        {/* FICHE D'ACTION DU POINT SÉLECTIONNÉ */}
        {selectedPin && (
          <div
            style={{
              padding: "14px 18px",
              borderTop: "1px solid #e2e8f0",
              backgroundColor: "#ffffff",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <div style={{ fontSize: "0.95rem", fontWeight: "bold", color: "#1e293b" }}>
                {selectedPin.title}
              </div>
              <div style={{ fontSize: "0.78rem", color: "#64748b" }}>
                Position : X {selectedPin.x}% / Y {selectedPin.y}%
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button
                onClick={() => {
                  const task = tasks.find((t) => t.title.toLowerCase().includes(selectedPin.title.toLowerCase()));
                  if (task && onStatusChange) onStatusChange(task.id, "FAIT");
                  setSelectedPin(null);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  backgroundColor: "#22c55e",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "6px",
                  padding: "8px 14px",
                  fontWeight: "bold",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                <CheckCircle2 size={16} /> Fait
              </button>

              <button
                onClick={() => {
                  const task = tasks.find((t) => t.title.toLowerCase().includes(selectedPin.title.toLowerCase()));
                  if (task && onStatusChange) onStatusChange(task.id, "RESERVE");
                  setSelectedPin(null);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
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
                <AlertTriangle size={16} /> Réserve
              </button>

              <button
                onClick={() => setSelectedPin(null)}
                style={{
                  backgroundColor: "#f1f5f9",
                  color: "#64748b",
                  border: "none",
                  borderRadius: "6px",
                  padding: "8px 12px",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
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