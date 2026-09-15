import { useState, useEffect } from "react";
import {
  fetchTasks,
  updateTaskStatus,
  triggerSync,
  getApiKey,
  setApiKey,
} from "./syncService";
import {
  CheckCircle2,
  AlertTriangle,
  Circle,
  ChevronDown,
  ChevronRight,
  Wifi,
  WifiOff,
  Settings,
  MessageSquare,
} from "lucide-react";

const MONTH_NAMES = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

// Helper pour formater la date/heure en français
function formatCompletedAt(isoString) {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    const dateStr = d.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const timeStr = d.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `le ${dateStr} à ${timeStr}`;
  } catch {
    return "";
  }
}

export default function App() {
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(
    currentDate.getMonth() + 1,
  );
  const [selectedYear] = useState(currentDate.getFullYear());
  const [tasks, setTasks] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [openCategories, setOpenCategories] = useState({});
  const [authError, setAuthError] = useState(false);

  // Observations en cours d'édition (par taskId)
  const [notes, setNotes] = useState({});

  // Configuration utilisateur & clé API
  const [user, setUser] = useState(
    () => localStorage.getItem("pool_user") || "Grégory",
  );
  const [keyInput, setKeyInput] = useState(() => getApiKey());
  const [showSettings, setShowSettings] = useState(false);


useEffect(() => {
    let isMounted = true;

    async function loadData() {
      const {
        data,
        online,
        authError: err,
      } = await fetchTasks(selectedYear, selectedMonth);
      if (!isMounted) return;

      setAuthError(err);
      setTasks(data || []);
      setIsOnline(online);

      const cats = {};
      const initialNotes = {};
      (data || []).forEach((t) => {
        cats[t.category] = true;
        if (t.observation) {
          initialNotes[t.id] = t.observation;
        }
      });
      setOpenCategories(cats);
      setNotes(initialNotes);
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    const handleStatus = () => {
      const online = navigator.onLine;
      setIsOnline(online);
      if (online) {
        triggerSync();
      }
    };

    window.addEventListener("online", handleStatus);
    window.addEventListener("offline", handleStatus);

    return () => {
      window.removeEventListener("online", handleStatus);
      window.removeEventListener("offline", handleStatus);
    };
  }, []);

  const handleToggleCategory = (cat) => {
    setOpenCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const handleStatusChange = async (taskId, newStatus) => {
    const currentNote = notes[taskId] || "";
    const isDoneOrReserve = newStatus === "FAIT" || newStatus === "RESERVE";
    const completedAt = isDoneOrReserve ? new Date().toISOString() : null;
    const operator = isDoneOrReserve ? user : null;

    await updateTaskStatus(
      taskId,
      selectedYear,
      selectedMonth,
      newStatus,
      currentNote,
      operator,
      completedAt,
    );

    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: newStatus,
              observation: currentNote,
              updatedBy: operator,
              completedAt: completedAt,
            }
          : t,
      ),
    );
  };

  const handleNoteChange = (taskId, text) => {
    setNotes((prev) => ({ ...prev, [taskId]: text }));
  };

  const handleSaveNote = async (task) => {
    const noteText = notes[task.id] || "";
    await updateTaskStatus(
      task.id,
      selectedYear,
      selectedMonth,
      task.status,
      noteText,
      user,
      task.completedAt,
    );
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, observation: noteText } : t)),
    );
  };

  const saveSettings = () => {
    localStorage.setItem("pool_user", user);
    setApiKey(keyInput);
    setShowSettings(false);
    window.location.reload();
  };

  // Groupement par catégorie avec tri : les tâches dues en premier
  const groupedTasks = tasks.reduce((acc, task) => {
    acc[task.category] = acc[task.category] || [];
    acc[task.category].push(task);
    return acc;
  }, {});

  Object.keys(groupedTasks).forEach((cat) => {
    groupedTasks[cat].sort((a, b) => {
      if (a.isDue && !b.isDue) return -1;
      if (!a.isDue && b.isDue) return 1;
      return 0;
    });
  });

  const dueTasks = tasks.filter((t) => t.isDue);
  const doneTasks = dueTasks.filter((t) => t.status === "FAIT");
  const warningTasks = dueTasks.filter((t) => t.status === "RESERVE");
  const completionRate =
    dueTasks.length > 0
      ? Math.round((doneTasks.length / dueTasks.length) * 100)
      : 0;

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f1f5f9",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "16px",
      }}
    >
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        {/* EN-TÊTE */}
        <header
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            marginBottom: "20px",
            backgroundColor: "#ffffff",
            padding: "16px 20px",
            borderRadius: "12px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "1.4rem",
                fontWeight: "bold",
                margin: 0,
                color: "#0f172a",
              }}
            >
              Piscine d'Ambérieu
            </h1>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: "0.9rem",
                color: "#64748b",
              }}
            >
              Suivi de maintenance préventive — Utilisateur :{" "}
              <strong>{user}</strong>
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.85rem",
                padding: "6px 12px",
                borderRadius: "20px",
                backgroundColor: isOnline ? "#dcfce7" : "#fee2e2",
                color: isOnline ? "#166534" : "#991b1b",
                fontWeight: "500",
              }}
            >
              {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
              {isOnline ? "Connecté" : "Hors-ligne"}
            </div>
            <button
              onClick={() => setShowSettings(!showSettings)}
              style={{
                border: "none",
                background: "#e2e8f0",
                borderRadius: "8px",
                padding: "8px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
              title="Paramètres d'accès"
            >
              <Settings size={18} color="#475569" />
            </button>
          </div>
        </header>

        {/* PARAMÈTRES / SÉCURITÉ */}
        {showSettings && (
          <div
            style={{
              backgroundColor: "#ffffff",
              padding: "20px",
              borderRadius: "12px",
              border: "1px solid #cbd5e1",
              marginBottom: "20px",
              boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)",
            }}
          >
            <h3
              style={{
                margin: "0 0 12px 0",
                fontSize: "1.05rem",
                color: "#1e293b",
              }}
            >
              Profil & Clé d'API
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "12px",
                marginBottom: "14px",
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.85rem",
                    color: "#475569",
                    marginBottom: "4px",
                  }}
                >
                  Nom / Prénom :
                </label>
                <input
                  type="text"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.85rem",
                    color: "#475569",
                    marginBottom: "4px",
                  }}
                >
                  Clé d'API (X-API-KEY) :
                </label>
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="Ex: piscine-amberieu-secret-key-2026"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>
            <button
              onClick={saveSettings}
              style={{
                backgroundColor: "#0284c7",
                color: "white",
                border: "none",
                borderRadius: "6px",
                padding: "8px 18px",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              Enregistrer
            </button>
          </div>
        )}

        {authError && (
          <div
            style={{
              backgroundColor: "#fee2e2",
              border: "1px solid #f87171",
              color: "#991b1b",
              padding: "12px 16px",
              borderRadius: "8px",
              marginBottom: "20px",
              fontSize: "0.9rem",
            }}
          >
            <strong>Erreur d'accès :</strong> Clé d'API incorrecte ou absente.
            Cliquez sur la roue crantée pour la configurer.
          </div>
        )}

        {/* TABLEAU DE BORD */}
        <div
          style={{
            backgroundColor: "#ffffff",
            padding: "16px 20px",
            borderRadius: "12px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              style={{
                fontSize: "1.05rem",
                fontWeight: "bold",
                color: "#0f172a",
                backgroundColor: "#ffffff",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                padding: "8px 14px",
                cursor: "pointer",
              }}
            >
              {MONTH_NAMES.map((name, idx) => (
                <option
                  key={idx + 1}
                  value={idx + 1}
                  style={{ color: "#0f172a", backgroundColor: "#ffffff" }}
                >
                  {name} {selectedYear}
                </option>
              ))}
            </select>

            <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
              <div style={{ textAlign: "right" }}>
                <span
                  style={{
                    fontSize: "1.4rem",
                    fontWeight: "bold",
                    color: "#0284c7",
                  }}
                >
                  {completionRate}%
                </span>
                <span
                  style={{
                    fontSize: "0.8rem",
                    color: "#64748b",
                    display: "block",
                  }}
                >
                  Taux de réalisation
                </span>
              </div>
              <div
                style={{
                  borderLeft: "1px solid #e2e8f0",
                  paddingLeft: "16px",
                  fontSize: "0.85rem",
                }}
              >
                <div>
                  <strong style={{ color: "#16a34a" }}>
                    {doneTasks.length}
                  </strong>{" "}
                  / {dueTasks.length} faites
                </div>
                {warningTasks.length > 0 && (
                  <div style={{ color: "#d97706", marginTop: "2px" }}>
                    <strong>{warningTasks.length}</strong> réserve(s)
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* CATÉGORIES */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
            gap: "16px",
            alignItems: "start",
          }}
        >
          {Object.entries(groupedTasks).map(([category, items]) => {
            const isOpen = openCategories[category];
            return (
              <div
                key={category}
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "12px",
                  overflow: "hidden",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div
                  onClick={() => handleToggleCategory(category)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "14px 16px",
                    cursor: "pointer",
                    backgroundColor: "#f8fafc",
                    userSelect: "none",
                  }}
                >
                  <span
                    style={{
                      fontWeight: "600",
                      fontSize: "0.95rem",
                      color: "#1e293b",
                    }}
                  >
                    {category}
                  </span>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                      ({items.length})
                    </span>
                    {isOpen ? (
                      <ChevronDown size={18} color="#64748b" />
                    ) : (
                      <ChevronRight size={18} color="#64748b" />
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div>
                    {items.map((task) => {
                      const isDue = task.isDue;
                      const isWarning = task.status === "RESERVE";
                      const hasNote = Boolean(
                        task.observation && task.observation.trim().length > 0,
                      );

                      return (
                        <div
                          key={task.id}
                          style={{
                            padding: "12px 16px",
                            borderBottom: "1px solid #f1f5f9",
                            opacity: isDue ? 1 : 0.45,
                            backgroundColor: isDue ? "#ffffff" : "#fafafa",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              justifyContent: "space-between",
                              gap: "12px",
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  fontSize: "0.95rem",
                                  fontWeight: "500",
                                  color: "#1e293b",
                                }}
                              >
                                {task.title}
                              </div>
                              <div
                                style={{
                                  fontSize: "0.78rem",
                                  color: "#64748b",
                                  marginTop: "2px",
                                  lineHeight: "1.4",
                                }}
                              >
                                <span>{task.frequency}</span>
                                {!isDue && (
                                  <span
                                    style={{
                                      marginLeft: "6px",
                                      color: "#94a3b8",
                                    }}
                                  >
                                    • Non dû ce mois
                                  </span>
                                )}
                                {task.status !== "A_FAIRE" &&
                                  task.updatedBy && (
                                    <span style={{ marginLeft: "6px" }}>
                                      • Validé par{" "}
                                      <strong style={{ color: "#334155" }}>
                                        {task.updatedBy}
                                      </strong>
                                      {task.completedAt && (
                                        <span style={{ color: "#0284c7" }}>
                                          {" "}
                                          {formatCompletedAt(task.completedAt)}
                                        </span>
                                      )}
                                    </span>
                                  )}
                              </div>
                            </div>

                            {/* BOUTONS ACTIONS */}
                            {isDue ? (
                              <div
                                style={{
                                  display: "flex",
                                  gap: "6px",
                                  flexShrink: 0,
                                }}
                              >
                                <button
                                  onClick={() =>
                                    handleStatusChange(task.id, "FAIT")
                                  }
                                  style={{
                                    padding: "7px",
                                    borderRadius: "8px",
                                    border: "none",
                                    backgroundColor:
                                      task.status === "FAIT"
                                        ? "#22c55e"
                                        : "#f1f5f9",
                                    color:
                                      task.status === "FAIT"
                                        ? "#ffffff"
                                        : "#64748b",
                                    cursor: "pointer",
                                  }}
                                  title="Fait"
                                >
                                  <CheckCircle2 size={18} />
                                </button>
                                <button
                                  onClick={() =>
                                    handleStatusChange(task.id, "RESERVE")
                                  }
                                  style={{
                                    padding: "7px",
                                    borderRadius: "8px",
                                    border: "none",
                                    backgroundColor: isWarning
                                      ? "#f59e0b"
                                      : "#f1f5f9",
                                    color: isWarning ? "#ffffff" : "#64748b",
                                    cursor: "pointer",
                                  }}
                                  title="Réserve / Attention"
                                >
                                  <AlertTriangle size={18} />
                                </button>
                                <button
                                  onClick={() =>
                                    handleStatusChange(task.id, "A_FAIRE")
                                  }
                                  style={{
                                    padding: "7px",
                                    borderRadius: "8px",
                                    border: "none",
                                    backgroundColor:
                                      task.status === "A_FAIRE"
                                        ? "#ef4444"
                                        : "#f1f5f9",
                                    color:
                                      task.status === "A_FAIRE"
                                        ? "#ffffff"
                                        : "#64748b",
                                    cursor: "pointer",
                                  }}
                                  title="À faire"
                                >
                                  <Circle size={18} />
                                </button>
                              </div>
                            ) : (
                              <span
                                style={{
                                  fontSize: "0.8rem",
                                  color: "#cbd5e1",
                                }}
                              >
                                —
                              </span>
                            )}
                          </div>

                          {/* ZONE TEXTAREA LORSQU'UNE RÉSERVE EST COCHÉE */}
                          {isDue && isWarning && (
                            <div
                              style={{
                                marginTop: "10px",
                                padding: "10px",
                                backgroundColor: "#fffbeb",
                                borderRadius: "8px",
                                border: "1px solid #fde68a",
                              }}
                            >
                              <label
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  fontSize: "0.8rem",
                                  fontWeight: "600",
                                  color: "#92400e",
                                  marginBottom: "6px",
                                }}
                              >
                                <MessageSquare size={14} /> Préciser l'anomalie
                                / réserve constatée :
                              </label>
                              <textarea
                                value={notes[task.id] ?? task.observation ?? ""}
                                onChange={(e) =>
                                  handleNoteChange(task.id, e.target.value)
                                }
                                placeholder="Ex. Fuite constatée, vis manquante, pièce à commander..."
                                rows={2}
                                style={{
                                  width: "100%",
                                  boxSizing: "border-box",
                                  padding: "8px",
                                  borderRadius: "6px",
                                  border: "1px solid #fcd34d",
                                  fontSize: "0.85rem",
                                  fontFamily: "inherit",
                                  resize: "vertical",
                                }}
                              />
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "flex-end",
                                  marginTop: "6px",
                                }}
                              >
                                <button
                                  onClick={() => handleSaveNote(task)}
                                  style={{
                                    backgroundColor: "#d97706",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "6px",
                                    padding: "4px 10px",
                                    fontSize: "0.78rem",
                                    fontWeight: "600",
                                    cursor: "pointer",
                                  }}
                                >
                                  Enregistrer la note
                                </button>
                              </div>
                            </div>
                          )}

                          {/* AFFICHAGE DE LA NOTE EXISTANTE */}
                          {isDue && !isWarning && hasNote && (
                            <div
                              style={{
                                marginTop: "8px",
                                fontSize: "0.8rem",
                                color: "#475569",
                                backgroundColor: "#f8fafc",
                                padding: "6px 10px",
                                borderRadius: "6px",
                                borderLeft: "3px solid #cbd5e1",
                              }}
                            >
                              <strong>Note précédente :</strong>{" "}
                              {task.observation}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
