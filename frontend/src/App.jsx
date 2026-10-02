import { useState, useEffect } from "react";
import {
  fetchTasks,
  updateTaskStatus,
  triggerSync,
  getApiKey,
  setApiKey,
} from "./syncService";
import {
  Settings,
  X,
  Shield,
  Printer,
  FileSpreadsheet,
  Search,
  Filter,
  Map,
} from "lucide-react";
import { compressImage } from "./imageUtils";
import AdminDashboard from "./AdminDashboard";
import { exportTasksToExcel, exportTasksToPDF } from "./exportUtils";
import { useRegisterSW } from "virtual:pwa-register/react";
import "./App.css";
import ConnectionStatus from "./components/ConnectionStatus";
import CategoryList from "./components/CategoryList";
import PhotoLightbox from "./components/PhotoLightbox";
import PrintSignature from "./components/PrintSignature";
import TaskHistoryModal from "./components/TaskHistoryModal";
import UpdateBanner from "./components/UpdateBanner";
import InteractivePlan from "./components/InteractivePlan";

const API_BASE_URL = "https://vericelgregory.alwaysdata.net/piscine/api";

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
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  const [selectedYear] = useState(currentDate.getFullYear());
  const [tasks, setTasks] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [openCategories, setOpenCategories] = useState({});
  const [authError, setAuthError] = useState(false);

  const [notes, setNotes] = useState({});
  const [photos, setPhotos] = useState({});
  const [previewImage, setPreviewImage] = useState(null);

  const [user, setUser] = useState(() => localStorage.getItem("pool_user") || "Grégory");
  const [keyInput, setKeyInput] = useState(() => getApiKey());
  const [showSettings, setShowSettings] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);

  const [historyTask, setHistoryTask] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [planLayer, setPlanLayer] = useState(null);

  const [planPins, setPlanPins] = useState(() => {
    const cached = localStorage.getItem("pool_plan_pins");
    return cached ? JSON.parse(cached) : [];
  });

  const [pinStates, setPinStates] = useState({});

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

  // Met à jour la tâche parente (statut RÉSERVE ou FAIT, et notes d'anomalies)
  const applyPinStatesToTasks = (currentPinStates, currentPins, currentTasks) => {
    if (!currentPins || currentPins.length === 0 || !currentTasks || currentTasks.length === 0) return;

    const types = ["extincteur", "baes", "desenfumage", "coupure"];

    for (const pinType of types) {
      const allPinsOfType = currentPins.filter((p) => p.type === pinType);
      if (allPinsOfType.length === 0) continue;

      const targetTask = currentTasks.find((t) => {
        const tLow = (t.title || "").toLowerCase();
        if (pinType === "extincteur") return tLow.includes("extincteur");
        if (pinType === "baes") return tLow.includes("baes") || tLow.includes("éclairage");
        if (pinType === "desenfumage") return tLow.includes("désenfumage") || tLow.includes("desenfumage");
        if (pinType === "coupure") return tLow.includes("coupure") || tLow.includes("gaz") || tLow.includes("arrêt");
        return false;
      });

      if (!targetTask) continue;

      const reservesOfThisType = allPinsOfType.filter(
        (p) => currentPinStates[p.id]?.status === "RESERVE"
      );

      if (reservesOfThisType.length > 0) {
        const combinedNotes = reservesOfThisType
          .map((p) => {
            const itemNote = currentPinStates[p.id]?.note;
            return `${p.title}${itemNote ? ` : ${itemNote}` : ""}`;
          })
          .join(" | ");

        setNotes((prev) => ({ ...prev, [targetTask.id]: combinedNotes }));

        setTasks((prev) =>
          prev.map((t) =>
            t.id === targetTask.id
              ? {
                  ...t,
                  status: "RESERVE",
                  observation: combinedNotes,
                }
              : t
          )
        );
      } else {
        const checkedDoneCount = allPinsOfType.filter(
          (p) => currentPinStates[p.id]?.status === "FAIT"
        ).length;

        if (checkedDoneCount === allPinsOfType.length && allPinsOfType.length > 0) {
          setTasks((prev) =>
            prev.map((t) =>
              t.id === targetTask.id ? { ...t, status: "FAIT" } : t
            )
          );
        }
      }
    }
  };

  // Chargement des tâches et des états mensuels de pastilles
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      const { data, online, authError: err } = await fetchTasks(selectedYear, selectedMonth);
      if (!isMounted) return;

      setAuthError(err);
      const loadedTasks = data || [];
      setTasks(loadedTasks);
      setIsOnline(online);

      const cats = {};
      const initialNotes = {};
      loadedTasks.forEach((t) => {
        cats[t.category] = true;
        if (t.observation) {
          initialNotes[t.id] = t.observation;
        }
      });
      setOpenCategories(cats);
      setNotes(initialNotes);

      // Chargement des états de pastilles depuis le serveur
      try {
        const res = await fetch(`${API_BASE_URL}/plan-pin-states/${selectedYear}/${selectedMonth}`, {
          headers: { "X-API-KEY": getApiKey() },
        });
        if (res.ok) {
          const serverStates = await res.json();
          if (isMounted) {
            const states = serverStates || {};
            setPinStates(states);
            localStorage.setItem("pool_pin_states", JSON.stringify(states));
            applyPinStatesToTasks(states, planPins, loadedTasks);
          }
        }
      } catch (e) {
        console.warn("Mode hors-ligne ou erreur chargement états pastilles :", e);
        const cached = localStorage.getItem("pool_pin_states");
        if (cached && isMounted) {
          const parsed = JSON.parse(cached);
          setPinStates(parsed);
          applyPinStatesToTasks(parsed, planPins, loadedTasks);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [selectedYear, selectedMonth, planPins]);

  // Chargement de l'inventaire des pastilles
  useEffect(() => {
    let isMounted = true;
    async function loadPinsFromApi() {
      try {
        const res = await fetch(`${API_BASE_URL}/plan-pins`, {
          headers: { "X-API-KEY": getApiKey() },
        });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && Array.isArray(data) && data.length > 0) {
            setPlanPins(data);
            localStorage.setItem("pool_plan_pins", JSON.stringify(data));
          }
        }
      } catch (err) {
        console.warn("Mode hors-ligne ou erreur chargement plan-pins :", err);
      }
    }
    loadPinsFromApi();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handleStatus = () => {
      const online = navigator.onLine;
      setIsOnline(online);
      if (online) triggerSync();
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
      currentPhoto
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
          : t
      )
    );
  };

  // Mise à jour du statut d'une pastille + synchronisation automatique avec la tâche parente
  const handlePinStatusUpdate = async (pin, status, note = "") => {
    const now = new Date().toISOString();

    const updatedStates = {
      ...pinStates,
      [pin.id]: {
        status,
        note,
        updatedBy: user,
        completedAt: now,
      },
    };
    setPinStates(updatedStates);
    localStorage.setItem("pool_pin_states", JSON.stringify(updatedStates));

    // Sauvegarde sur Alwaysdata
    try {
      fetch(`${API_BASE_URL}/plan-pin-states/${selectedYear}/${selectedMonth}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": getApiKey(),
        },
        body: JSON.stringify(updatedStates),
      });
    } catch (e) {
      console.warn("Erreur sauvegarde pin state :", e);
    }

    const pinType = pin.type;
    const allPinsOfType = planPins.filter((p) => p.type === pinType);

    const targetTask = tasks.find((t) => {
      const tLow = (t.title || "").toLowerCase();
      if (pinType === "extincteur") return tLow.includes("extincteur");
      if (pinType === "baes") return tLow.includes("baes") || tLow.includes("éclairage");
      if (pinType === "desenfumage") return tLow.includes("désenfumage") || tLow.includes("desenfumage");
      if (pinType === "coupure") return tLow.includes("coupure") || tLow.includes("gaz") || tLow.includes("arrêt");
      return false;
    });

    applyPinStatesToTasks(updatedStates, planPins, tasks);

    if (targetTask) {
      const reservesOfThisType = allPinsOfType.filter(
        (p) => updatedStates[p.id]?.status === "RESERVE"
      );
      const combinedNotes = reservesOfThisType
        .map((p) => {
          const itemNote = updatedStates[p.id]?.note;
          return `${p.title}${itemNote ? ` : ${itemNote}` : ""}`;
        })
        .join(" | ");

      const allCheckedDone =
        allPinsOfType.length > 0 &&
        allPinsOfType.filter((p) => updatedStates[p.id]?.status === "FAIT").length === allPinsOfType.length;

      const newStatus = reservesOfThisType.length > 0 ? "RESERVE" : allCheckedDone ? "FAIT" : "A_FAIRE";

      await updateTaskStatus(
        targetTask.id,
        selectedYear,
        selectedMonth,
        newStatus,
        combinedNotes,
        user,
        now,
        photos[targetTask.id] || null
      );
    }
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
      currentPhoto
    );

    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, observation: noteText, photoBase64: currentPhoto }
          : t
      )
    );
  };

  const saveSettings = () => {
    localStorage.setItem("pool_user", user);
    setApiKey(keyInput);
    setShowSettings(false);
    window.location.reload();
  };

  const openTaskHistory = async (task) => {
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
          {needRefresh && (
            <UpdateBanner onUpdate={() => updateServiceWorker(true)} />
          )}

          <div>
            <h1 className="app-title">Piscine d'Ambérieu</h1>
            <p className="app-subtitle">
              Suivi de maintenance préventive — Utilisateur :{" "}
              <strong>{user}</strong>
            </p>
          </div>

          <div className="header-actions no-print">
            <ConnectionStatus isOnline={isOnline} />
            <button
              onClick={() => setPlanLayer("extincteur")}
              className="icon-button plan"
              title="Ouvrir le Plan interactif Niveau 0"
            >
              <Map size={18} color="#d97706" />
            </button>
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
            <h3 className="settings-title">Profil & Clé d'API</h3>
            <div className="settings-fields">
              <div>
                <label className="form-label">Nom / Prénom :</label>
                <input
                  type="text"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label">Clé d'API (X-API-KEY) :</label>
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="Ex: piscine-amberieu-secret-key-2026"
                  className="form-input"
                />
              </div>
            </div>
            <button onClick={saveSettings} className="primary-button">
              Enregistrer
            </button>
          </div>
        )}

        {authError && (
          <div className="no-print auth-error">
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
                  <option key={idx + 1} value={idx + 1} className="month-option">
                    {name} {selectedYear}
                  </option>
                ))}
              </select>

              <div className="export-actions no-print">
                <button
                  onClick={() =>
                    exportTasksToExcel(
                      dueTasks,
                      MONTH_NAMES[selectedMonth - 1],
                      selectedYear
                    )
                  }
                  className="export-button"
                  title="Exporter le registre en fichier Excel (.xlsx)"
                >
                  <FileSpreadsheet size={16} /> Exporter Excel
                </button>

                <button
                  onClick={() =>
                    exportTasksToPDF(
                      dueTasks,
                      MONTH_NAMES[selectedMonth - 1],
                      selectedYear
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
                <span className="completion-rate">{completionRate}%</span>
                <span className="completion-label">Taux de réalisation</span>
              </div>
              <div className="task-counts">
                <div>
                  <strong className="done-count">{doneTasks.length}</strong> /{" "}
                  {dueTasks.length} faites
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

        {/* BARRE DE RECHERCHE ET FILTRES */}
        <div className="task-filters no-print">
          <div className="search-box">
            <Search size={17} color="#94a3b8" className="search-icon" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un équipement, contrôle..."
              className="search-input"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="clear-search">
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

        <CategoryList
          groupedTasks={groupedTasks}
          openCategories={openCategories}
          onToggleCategory={handleToggleCategory}
          taskProps={{
            notes,
            photos,
            planPins,
            pinStates,
            onStatusChange: handleStatusChange,
            onNoteChange: handleNoteChange,
            onPhotoChange: handlePhotoChange,
            onSaveNote: handleSaveNote,
            onOpenHistory: openTaskHistory,
            onOpenPlan: (layer) => setPlanLayer(layer || "all"),
            onPreviewImage: setPreviewImage,
            formatCompletedAt,
          }}
        />

        {/* CARTOUCHE D'ÉMARGEMENT */}
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

        {/* PLAN INTERACTIF */}
        {planLayer && (
          <InteractivePlan
            tasks={tasks}
            initialLayer={planLayer}
            pins={planPins}
            setPins={setPlanPins}
            pinStates={pinStates}
            onPinStatusUpdate={handlePinStatusUpdate}
            onClose={() => setPlanLayer(null)}
          />
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

        <PhotoLightbox
          image={previewImage}
          onClose={() => setPreviewImage(null)}
        />
      </div>
    </div>
  );
}