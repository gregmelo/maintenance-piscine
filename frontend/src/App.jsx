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
  Camera,
  X,
  Shield,
  Printer,
  FileSpreadsheet,
  Search,
  Filter,
  History,
} from "lucide-react";
import { compressImage } from "./imageUtils";
import AdminDashboard from "./AdminDashboard";
import { exportTasksToExcel, exportTasksToPDF } from "./exportUtils";
import { useRegisterSW } from "virtual:pwa-register/react";

const API_BASE_URL = "https://vericelgregory.alwaysdata.net/piscine/api";

// Les libelles sont partages par le selecteur de mois et les exports.
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

  const [notes, setNotes] = useState({});
  const [photos, setPhotos] = useState({});
  const [previewImage, setPreviewImage] = useState(null);

  const [user, setUser] = useState(
    () => localStorage.getItem("pool_user") || "Grégory",
  );
  const [keyInput, setKeyInput] = useState(() => getApiKey());
  const [showSettings, setShowSettings] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);

  // Historique spécifique d'une tâche
  const [historyTask, setHistoryTask] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered() {
      console.log("SW enregistré");
    },
    onRegisterError(error) {
      console.error("Erreur SW", error);
    },
  });

  useEffect(() => {
    let isMounted = true;

    // Le service choisit automatiquement l'API ou le cache IndexedDB.
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
    // Une reconnexion relance la file locale des modifications en attente.
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
    // Le statut, la note et la photo sont envoyes ensemble pour conserver un journal coherent.
    const currentNote = notes[taskId] || "";
    const currentPhoto = photos[taskId] || null;
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
      currentPhoto,
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
              photoBase64: currentPhoto,
            }
          : t,
      ),
    );
  };

  const handleNoteChange = (taskId, text) => {
    setNotes((prev) => ({ ...prev, [taskId]: text }));
  };

  const handlePhotoChange = async (taskId, file) => {
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      setPhotos((prev) => ({ ...prev, [taskId]: compressed }));
    } catch (err) {
      console.error("Erreur compression image :", err);
    }
  };

  const handleSaveNote = async (task) => {
    const noteText = notes[task.id] || "";
    const currentPhoto = photos[task.id] || null;

    await updateTaskStatus(
      task.id,
      selectedYear,
      selectedMonth,
      task.status,
      noteText,
      user,
      task.completedAt,
      currentPhoto,
    );

    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, observation: noteText, photoBase64: currentPhoto }
          : t,
      ),
    );
  };

  const saveSettings = () => {
    localStorage.setItem("pool_user", user);
    setApiKey(keyInput);
    setShowSettings(false);
    window.location.reload();
  };

  const openTaskHistory = async (task) => {
    // L'historique est charge a l'ouverture afin de ne pas alourdir la liste principale.
    setHistoryTask(task);
    setLoadingHistory(true);
    try {
      const res = await fetch(`${API_BASE_URL}/tasks/${task.id}/history`, {
        headers: { "X-API-KEY": getApiKey() },
      });
      if (res.ok) {
        const data = await res.json();
        setHistoryData(data.history || []);
      }
    } catch (err) {
      console.error("Erreur historique :", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Filtrage combine : recherche textuelle et affichage optionnel des taches restantes.
  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (task.category || "").toLowerCase().includes(searchQuery.toLowerCase());

    const matchesPending = onlyPending
      ? task.isDue && task.status !== "FAIT"
      : true;

    return matchesSearch && matchesPending;
  });

  const groupedTasks = filteredTasks.reduce((acc, task) => {
    acc[task.category] = acc[task.category] || [];
    acc[task.category].push(task);
    return acc;
  }, {});

  Object.keys(groupedTasks).forEach((cat) => {
    // Les controles a faire restent visibles avant ceux deja traites.
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
      <style>{`
        @media print {
          header button, .no-print, input, textarea, select {
            display: none !important;
          }
          body, #root {
            background-color: #ffffff !important;
            padding: 0 !important;
          }
          .print-only {
            display: block !important;
          }
          .page-break {
            page-break-inside: avoid;
          }
        }
        @media screen {
          .print-only {
            display: none;
          }
        }
      `}</style>

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
          {needRefresh && (
            <div
              style={{
                width: "100%",
                backgroundColor: "#0284c7",
                color: "#ffffff",
                padding: "10px 16px",
                borderRadius: "10px",
                marginBottom: "10px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
              }}
            >
              <span style={{ fontSize: "0.9rem", fontWeight: "500" }}>
                Une nouvelle version est disponible !
              </span>
              <button
                onClick={() => updateServiceWorker(true)}
                style={{
                  backgroundColor: "#ffffff",
                  color: "#0284c7",
                  border: "none",
                  borderRadius: "6px",
                  padding: "6px 14px",
                  fontWeight: "bold",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                Mettre à jour
              </button>
            </div>
          )}

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

          <div
            style={{ display: "flex", alignItems: "center", gap: "10px" }}
            className="no-print"
          >
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
            <button
              onClick={() => setShowAdmin(true)}
              style={{
                border: "none",
                background: "#e0f2fe",
                borderRadius: "8px",
                padding: "8px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
              title="Administration & Registre des anomalies"
            >
              <Shield size={18} color="#0284c7" />
            </button>
          </div>
        </header>

        {/* PARAMÈTRES / SÉCURITÉ */}
        {showSettings && (
          <div
            className="no-print"
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
            className="no-print"
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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                flexWrap: "wrap",
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

              {/* BOUTONS EXPORT Excel & PDF */}
              <div
                style={{ display: "flex", gap: "8px", alignItems: "center" }}
                className="no-print"
              >
                <button
                  onClick={() =>
                    exportTasksToExcel(
                      dueTasks,
                      MONTH_NAMES[selectedMonth - 1],
                      selectedYear,
                    )
                  }
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    backgroundColor: "#f1f5f9",
                    color: "#334155",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    fontSize: "0.85rem",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                  title="Exporter le registre en fichier Excel / Excel"
                >
                  <FileSpreadsheet size={16} /> Exporter Excel
                </button>

                <button
                  onClick={() =>
                    exportTasksToPDF(
                      dueTasks,
                      MONTH_NAMES[selectedMonth - 1],
                      selectedYear,
                    )
                  }
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    backgroundColor: "#f1f5f9",
                    color: "#334155",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    fontSize: "0.85rem",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                  title="Télécharger le registre au format PDF"
                >
                  <Printer size={16} /> Exporter PDF
                </button>
              </div>
            </div>

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

        {/* BARRE DE RECHERCHE ET FILTRES RAPIDES */}
        <div
          className="no-print"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              position: "relative",
              flex: "1 1 260px",
              maxWidth: "420px",
            }}
          >
            <Search
              size={17}
              color="#94a3b8"
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
              }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un équipement, contrôle..."
              style={{
                width: "100%",
                padding: "9px 12px 9px 38px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                backgroundColor: "#ffffff",
                fontSize: "0.88rem",
                boxSizing: "border-box",
                outline: "none",
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "#94a3b8",
                  cursor: "pointer",
                  padding: "2px",
                }}
              >
                <X size={15} />
              </button>
            )}
          </div>

          <button
            onClick={() => setOnlyPending(!onlyPending)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              borderRadius: "8px",
              border: onlyPending ? "1px solid #0284c7" : "1px solid #cbd5e1",
              backgroundColor: onlyPending ? "#e0f2fe" : "#ffffff",
              color: onlyPending ? "#0369a1" : "#475569",
              fontSize: "0.85rem",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            <Filter size={15} />
            {onlyPending
              ? "Affichage : Restantes à traiter"
              : "Affichage : Toutes les vérifications"}
          </button>
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
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "0.95rem",
                                    fontWeight: "500",
                                    color: "#1e293b",
                                  }}
                                >
                                  {task.title}
                                </span>
                                <button
                                  onClick={() => openTaskHistory(task)}
                                  className="no-print"
                                  style={{
                                    background: "none",
                                    border: "none",
                                    color: "#94a3b8",
                                    cursor: "pointer",
                                    padding: "2px",
                                    display: "inline-flex",
                                    alignItems: "center",
                                  }}
                                  title="Consulter l'historique de cette tâche"
                                >
                                  <History size={14} />
                                </button>
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
                                className="no-print"
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

                          {/* ZONE TEXTAREA ET PHOTO LORSQU'UNE RÉSERVE EST COCHÉE */}
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

                              {/* Bouton de prise de vue & Aperçu */}
                              <div
                                style={{
                                  marginTop: "8px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "10px",
                                }}
                              >
                                <label
                                  className="no-print"
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    backgroundColor: "#fef3c7",
                                    color: "#92400e",
                                    border: "1px solid #fcd34d",
                                    padding: "6px 10px",
                                    borderRadius: "6px",
                                    fontSize: "0.8rem",
                                    fontWeight: "600",
                                    cursor: "pointer",
                                  }}
                                >
                                  <Camera size={16} /> Ajouter une photo
                                  <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    style={{ display: "none" }}
                                    onChange={(e) =>
                                      handlePhotoChange(
                                        task.id,
                                        e.target.files[0],
                                      )
                                    }
                                  />
                                </label>

                                {(photos[task.id] || task.photoUrl) && (
                                  <img
                                    src={
                                      photos[task.id]
                                        ? photos[task.id]
                                        : `https://vericelgregory.alwaysdata.net/piscine${task.photoUrl}`
                                    }
                                    alt="Aperçu réserve"
                                    onClick={() =>
                                      setPreviewImage(
                                        photos[task.id]
                                          ? photos[task.id]
                                          : `https://vericelgregory.alwaysdata.net/piscine${task.photoUrl}`,
                                      )
                                    }
                                    style={{
                                      width: "42px",
                                      height: "42px",
                                      objectFit: "cover",
                                      borderRadius: "6px",
                                      border: "1px solid #cbd5e1",
                                      cursor: "pointer",
                                    }}
                                    title="Cliquer pour agrandir l'image"
                                  />
                                )}
                              </div>

                              <div
                                className="no-print"
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

                          {/* AFFICHAGE DE LA NOTE ET DE LA PHOTO EXISTANTES */}
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
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                              }}
                            >
                              <div>
                                <strong>Note précédente :</strong>{" "}
                                {task.observation}
                              </div>
                              {task.photoUrl && (
                                <img
                                  src={`https://vericelgregory.alwaysdata.net/piscine${task.photoUrl}`}
                                  alt="Photo réserve"
                                  onClick={() =>
                                    setPreviewImage(
                                      `https://vericelgregory.alwaysdata.net/piscine${task.photoUrl}`,
                                    )
                                  }
                                  style={{
                                    width: "36px",
                                    height: "36px",
                                    objectFit: "cover",
                                    borderRadius: "4px",
                                    border: "1px solid #cbd5e1",
                                    cursor: "pointer",
                                  }}
                                  title="Cliquer pour agrandir"
                                />
                              )}
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

        {/* CARTOUCHE D'ÉMARGEMENT POUR L'IMPRESSION RÉGLEMENTAIRE */}
        <div
          className="print-only"
          style={{
            marginTop: "40px",
            padding: "16px",
            border: "1px solid #94a3b8",
            borderRadius: "8px",
            pageBreakInside: "avoid",
          }}
        >
          <h4 style={{ margin: "0 0 10px 0" }}>
            Émargement et validation réglementaire
          </h4>
          <p
            style={{
              fontSize: "0.85rem",
              color: "#334155",
              margin: "0 0 40px 0",
            }}
          >
            Registre de vérifications périodiques — Mois de{" "}
            {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
          </p>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>Signature du technicien : ___________________</div>
            <div>Visa de la direction / régie : ___________________</div>
          </div>
        </div>

        {/* MODALE HISTORIQUE D'UNE TÂCHE */}
        {historyTask && (
          <div
            onClick={() => setHistoryTask(null)}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100vw",
              height: "100vh",
              backgroundColor: "rgba(15, 23, 42, 0.6)",
              backdropFilter: "blur(4px)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 9999,
              padding: "16px",
              boxSizing: "border-box",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "14px",
                width: "100%",
                maxWidth: "560px",
                maxHeight: "80vh",
                display: "flex",
                flexDirection: "column",
                padding: "20px",
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "14px",
                  borderBottom: "1px solid #e2e8f0",
                  paddingBottom: "10px",
                }}
              >
                <div>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: "1.1rem",
                      color: "#0f172a",
                      fontWeight: "bold",
                    }}
                  >
                    Historique des contrôles
                  </h3>
                  <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                    {historyTask.title}
                  </span>
                </div>
                <button
                  onClick={() => setHistoryTask(null)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#64748b",
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              <div style={{ flex: 1, overflowY: "auto", paddingRight: "4px" }}>
                {loadingHistory ? (
                  <p style={{ color: "#64748b" }}>Chargement de l'historique...</p>
                ) : historyData.length === 0 ? (
                  <p style={{ color: "#64748b", fontStyle: "italic" }}>
                    Aucun historique enregistré pour ce point de contrôle.
                  </p>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                    }}
                  >
                    {historyData.map((h) => (
                      <div
                        key={h.logId}
                        style={{
                          padding: "10px 14px",
                          borderRadius: "8px",
                          border: "1px solid #e2e8f0",
                          backgroundColor:
                            h.status === "FAIT"
                              ? "#f0fdf4"
                              : h.status === "RESERVE"
                                ? "#fffbeb"
                                : "#fef2f2",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: "4px",
                          }}
                        >
                          <span
                            style={{
                              fontWeight: "bold",
                              fontSize: "0.85rem",
                              color: "#1e293b",
                            }}
                          >
                            {MONTH_NAMES[h.month - 1]} {h.year}
                          </span>
                          <span
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: "bold",
                              color:
                                h.status === "FAIT"
                                  ? "#16a34a"
                                  : h.status === "RESERVE"
                                    ? "#d97706"
                                    : "#ef4444",
                            }}
                          >
                            {h.status === "FAIT"
                              ? "FAIT"
                              : h.status === "RESERVE"
                                ? "RÉSERVE"
                                : "À FAIRE"}
                          </span>
                        </div>
                        {h.updatedBy && (
                          <div
                            style={{ fontSize: "0.75rem", color: "#64748b" }}
                          >
                            Par {h.updatedBy}{" "}
                            {h.completedAt && formatCompletedAt(h.completedAt)}
                          </div>
                        )}
                        {h.observation && (
                          <div
                            style={{
                              fontSize: "0.8rem",
                              marginTop: "4px",
                              color: "#334155",
                              fontStyle: "italic",
                            }}
                          >
                            « {h.observation} »
                          </div>
                        )}
                        {h.photoUrl && (
                          <div style={{ marginTop: "6px" }}>
                            <img
                              src={`https://vericelgregory.alwaysdata.net/piscine${h.photoUrl}`}
                              alt="Photo contrôle"
                              onClick={() =>
                                setPreviewImage(
                                  `https://vericelgregory.alwaysdata.net/piscine${h.photoUrl}`,
                                )
                              }
                              style={{
                                width: "45px",
                                height: "45px",
                                objectFit: "cover",
                                borderRadius: "6px",
                                border: "1px solid #cbd5e1",
                                cursor: "pointer",
                              }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ESPACE ADMIN */}
        {showAdmin && (
          <AdminDashboard
            onClose={() => setShowAdmin(false)}
            onDataChanged={() => {
              window.location.reload();
            }}
            onPreviewImage={(url) => setPreviewImage(url)}
          />
        )}

        {/* MODALE LIGHTBOX */}
        {previewImage && (
          <div
            onClick={() => setPreviewImage(null)}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100vw",
              height: "100vh",
              backgroundColor: "rgba(15, 23, 42, 0.85)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 9999,
              padding: "20px",
              boxSizing: "border-box",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "relative",
                maxWidth: "90vw",
                maxHeight: "90vh",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <button
                onClick={() => setPreviewImage(null)}
                style={{
                  position: "absolute",
                  top: "-45px",
                  right: 0,
                  background: "transparent",
                  border: "none",
                  color: "#ffffff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.9rem",
                }}
              >
                <X size={24} /> Fermer
              </button>
              <img
                src={previewImage}
                alt="Agrandissement"
                style={{
                  maxWidth: "100%",
                  maxHeight: "85vh",
                  objectFit: "contain",
                  borderRadius: "8px",
                  boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
                  border: "2px solid #334155",
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}