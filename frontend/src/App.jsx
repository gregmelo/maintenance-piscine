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
import "./App.css";
import ConnectionStatus from "./components/ConnectionStatus";
import PhotoLightbox from "./components/PhotoLightbox";
import PrintSignature from "./components/PrintSignature";
import TaskHistoryModal from "./components/TaskHistoryModal";
import UpdateBanner from "./components/UpdateBanner";

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
    <div className="app-shell">
      <div className="app-container">
        {/* EN-TÊTE */}
        <header className="app-header">
          {needRefresh && <UpdateBanner onUpdate={() => updateServiceWorker(true)} />}

          <div>
            <h1 className="app-title">
              Piscine d'Ambérieu
            </h1>
            <p className="app-subtitle">
              Suivi de maintenance préventive — Utilisateur :{" "}
              <strong>{user}</strong>
            </p>
          </div>

          <div className="header-actions no-print">
            <ConnectionStatus isOnline={isOnline} />
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="icon-button settings"
              title="Paramètres d'accès"
            >
              <Settings size={18} color="#475569" />
            </button>
            <button
              onClick={() => setShowAdmin(true)}
              className="icon-button admin"
              title="Administration & Registre des anomalies"
            >
              <Shield size={18} color="#0284c7" />
            </button>
          </div>
        </header>

        {/* PARAMÈTRES / SÉCURITÉ */}
        {showSettings && (
          <div className="settings-panel no-print">
            <h3 className="settings-title">
              Profil & Clé d'API
            </h3>
            <div className="settings-fields">
              <div>
                <label className="form-label">
                  Nom / Prénom :
                </label>
                <input
                  type="text"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label">
                  Clé d'API (X-API-KEY) :
                </label>
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="Ex: piscine-amberieu-secret-key-2026"
                  className="form-input"
                />
              </div>
            </div>
            <button
              onClick={saveSettings}
              className="primary-button"
            >
              Enregistrer
            </button>
          </div>
        )}

        {authError && (
          <div
            className="no-print"
            className="auth-error"
          >
            <strong>Erreur d'accès :</strong> Clé d'API incorrecte ou absente.
            Cliquez sur la roue crantée pour la configurer.
          </div>
        )}

        {/* TABLEAU DE BORD */}
        <div className="dashboard-panel">
          <div className="dashboard-row">
            <div className="dashboard-controls">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="month-select"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option
                    key={idx + 1}
                    value={idx + 1}
                    className="month-option"
                  >
                    {name} {selectedYear}
                  </option>
                ))}
              </select>

              {/* BOUTONS EXPORT Excel & PDF */}
              <div className="export-actions no-print">
                <button
                  onClick={() =>
                    exportTasksToExcel(
                      dueTasks,
                      MONTH_NAMES[selectedMonth - 1],
                      selectedYear,
                    )
                  }
                  className="export-button"
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
                  className="export-button"
                  title="Télécharger le registre au format PDF"
                >
                  <Printer size={16} /> Exporter PDF
                </button>
              </div>
            </div>

            <div className="dashboard-stats">
              <div className="completion-stat">
                <span className="completion-rate">
                  {completionRate}%
                </span>
                <span className="completion-label">
                  Taux de réalisation
                </span>
              </div>
              <div className="task-counts">
                <div>
                  <strong className="done-count">
                    {doneTasks.length}
                  </strong>{" "}
                  / {dueTasks.length} faites
                </div>
                {warningTasks.length > 0 && (
                  <div className="reserve-count">
                    <strong>{warningTasks.length}</strong> réserve(s)
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* BARRE DE RECHERCHE ET FILTRES RAPIDES */}
        <div className="task-filters no-print">
          <div className="search-box">
            <Search
              size={17}
              color="#94a3b8"
              className="search-icon"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un équipement, contrôle..."
              className="search-input"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="clear-search"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <button
            onClick={() => setOnlyPending(!onlyPending)}
            className={`pending-filter ${onlyPending ? "is-active" : ""}`}
          >
            <Filter size={15} />
            {onlyPending
              ? "Affichage : Restantes à traiter"
              : "Affichage : Toutes les vérifications"}
          </button>
        </div>

        {/* CATÉGORIES */}
        <div className="categories-grid">
          {Object.entries(groupedTasks).map(([category, items]) => {
            const isOpen = openCategories[category];
            return (
              <div key={category} className="category-card">
                <div onClick={() => handleToggleCategory(category)} className="category-header">
                  <span className="category-name">
                    {category}
                  </span>
                  <div className="category-summary">
                    <span className="category-count">
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
                        <div key={task.id} className={`task-row ${isDue ? "" : "is-not-due"}`}>
                          <div className="task-main">
                            <div className="task-details">
                              <div className="task-heading">
                                <span className="task-title">
                                  {task.title}
                                </span>
                                <button
                                  onClick={() => openTaskHistory(task)}
                                  className="history-trigger no-print"
                                  title="Consulter l'historique de cette tâche"
                                >
                                  <History size={14} />
                                </button>
                              </div>
                              <div className="task-meta">
                                <span>{task.frequency}</span>
                                {!isDue && (
                                  <span className="not-due-label">
                                    • Non dû ce mois
                                  </span>
                                )}
                                {task.status !== "A_FAIRE" &&
                                  task.updatedBy && (
                                    <span className="validated-by">
                                      • Validé par{" "}
                                      <strong>
                                        {task.updatedBy}
                                      </strong>
                                      {task.completedAt && (
                                        <span className="completed-at">
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
                              <div className="task-actions no-print">
                                <button
                                  onClick={() =>
                                    handleStatusChange(task.id, "FAIT")
                                  }
                                  className={`status-button ${task.status === "FAIT" ? "is-done" : ""}`}
                                  title="Fait"
                                >
                                  <CheckCircle2 size={18} />
                                </button>
                                <button
                                  onClick={() =>
                                    handleStatusChange(task.id, "RESERVE")
                                  }
                                  className={`status-button ${isWarning ? "is-reserved" : ""}`}
                                  title="Réserve / Attention"
                                >
                                  <AlertTriangle size={18} />
                                </button>
                                <button
                                  onClick={() =>
                                    handleStatusChange(task.id, "A_FAIRE")
                                  }
                                  className={`status-button ${task.status === "A_FAIRE" ? "is-todo" : ""}`}
                                  title="À faire"
                                >
                                  <Circle size={18} />
                                </button>
                              </div>
                            ) : (
                              <span className="not-due-placeholder">
                                —
                              </span>
                            )}
                          </div>

                          {/* ZONE TEXTAREA ET PHOTO LORSQU'UNE RÉSERVE EST COCHÉE */}
                          {isDue && isWarning && (
                            <div className="reserve-editor">
                              <label className="reserve-label">
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
                                className="reserve-textarea"
                              />

                              {/* Bouton de prise de vue & Aperçu */}
                              <div className="photo-actions">
                                <label
                                  className="no-print"
                                  className="photo-upload"
                                >
                                  <Camera size={16} /> Ajouter une photo
                                  <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
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
                                    className="task-photo preview"
                                    title="Cliquer pour agrandir l'image"
                                  />
                                )}
                              </div>

                              <div className="save-note-row no-print">
                                <button
                                  onClick={() => handleSaveNote(task)}
                                  className="save-note-button"
                                >
                                  Enregistrer la note
                                </button>
                              </div>
                            </div>
                          )}

                          {/* AFFICHAGE DE LA NOTE ET DE LA PHOTO EXISTANTES */}
                          {isDue && !isWarning && hasNote && (
                            <div className="existing-note">
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
                                  className="task-photo existing"
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
        <PrintSignature
          month={MONTH_NAMES[selectedMonth - 1]}
          year={selectedYear}
        />

        <TaskHistoryModal
          task={historyTask}
          history={historyData}
          loading={loadingHistory}
          onClose={() => setHistoryTask(null)}
          onPreviewImage={setPreviewImage}
          formatDate={formatCompletedAt}
        />

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

        <PhotoLightbox image={previewImage} onClose={() => setPreviewImage(null)} />
      </div>
    </div>
  );
}