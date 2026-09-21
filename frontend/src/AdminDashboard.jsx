import { useState, useEffect } from "react";
import {
  ShieldAlert,
  PlusCircle,
  Trash2,
  CheckCircle,
  X,
  Lock,
  BarChart3,
  KeyRound,
  Database,
  Pencil,
  FileDown,
  Sparkles,
} from "lucide-react";
import { getApiKey } from "./syncService";
import { exportAnnualReportToPDF } from "./exportUtils";

const API_BASE_URL = "https://vericelgregory.alwaysdata.net/piscine/api";

// Cette liste alimente les libelles du bilan annuel et du formulaire des taches.
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

export default function AdminDashboard({
  onClose,
  onDataChanged,
  onPreviewImage,
}) {
  const [isAdminAuth, setIsAdminAuth] = useState(() =>
    Boolean(sessionStorage.getItem("pool_admin_token")),
  );
  const [pinInput, setPinInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [activeTab, setActiveTab] = useState("summary"); // "summary" | "reserves" | "tasks" | "security"

  // Changement de PIN
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [pinChangeMsg, setPinChangeMsg] = useState({ type: "", text: "" });

  // Nettoyage photos
  const [cleaningPhotos, setCleaningPhotos] = useState(false);
  const [cleanupResult, setCleanupResult] = useState(null);

  // Synthèse annuelle
  const [summaryYear, setSummaryYear] = useState(new Date().getFullYear());
  const [summaryData, setSummaryData] = useState([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [downloadingAnnualPdf, setDownloadingAnnualPdf] = useState(false);

  // Réserves
  const [reserves, setReserves] = useState([]);
  const [loadingReserves, setLoadingReserves] = useState(() => isAdminAuth);
  const [resolvingId, setResolvingId] = useState(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [deletePhoto, setDeletePhoto] = useState(true);

  // Tâches & Édition
  const [tasksList, setTasksList] = useState([]);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("Sécurité Incendie");
  const [newFrequency, setNewFrequency] = useState("Mensuel");
  const [newStartMonth, setNewStartMonth] = useState(1);
  const [editingTask, setEditingTask] = useState(null);

  const apiKey = getApiKey();

  const handleLogin = async (e) => {
    // Le serveur valide le PIN et renvoie un jeton de session temporaire.
    e.preventDefault();
    if (!pinInput.trim()) return;

    setIsVerifying(true);
    setAuthError("");

    try {
      const res = await fetch(`${API_BASE_URL}/admin/verify-pin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": apiKey,
        },
        body: JSON.stringify({ pin: pinInput }),
      });

      const data = await res.json();
      if (res.ok && data.valid) {
        sessionStorage.setItem("pool_admin_token", data.token);
        setIsAdminAuth(true);
        setPinInput("");
      } else {
        setAuthError(data.error || "Code PIN incorrect");
      }
    } catch {
      setAuthError("Erreur réseau ou clé d'API invalide");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleUpdatePin = async (e) => {
    e.preventDefault();
    setPinChangeMsg({ type: "", text: "" });

    try {
      const res = await fetch(`${API_BASE_URL}/admin/update-pin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": apiKey,
        },
        body: JSON.stringify({ currentPin: oldPin, newPin: newPin }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setPinChangeMsg({
          type: "success",
          text: "Code PIN modifié avec succès !",
        });
        setOldPin("");
        setNewPin("");
      } else {
        setPinChangeMsg({
          type: "error",
          text: data.error || "Erreur lors de la modification",
        });
      }
    } catch {
      setPinChangeMsg({
        type: "error",
        text: "Erreur de connexion au serveur",
      });
    }
  };

  const handleCleanupPhotos = async () => {
    // Le nettoyage est volontairement declenche par le responsable pour eviter une suppression implicite.
    if (!window.confirm("Nettoyer toutes les photos orphelines du serveur ?")) return;
    setCleaningPhotos(true);
    setCleanupResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/cleanup-photos`, {
        method: "POST",
        headers: { "X-API-KEY": apiKey },
      });
      const data = await res.json();
      if (res.ok) {
        setCleanupResult(`Nettoyage réussi : ${data.deletedCount} image(s) supprimée(s), ${data.freedKb} Ko libérés.`);
      }
    } catch {
      setCleanupResult("Erreur lors de l'opération de nettoyage.");
    } finally {
      setCleaningPhotos(false);
    }
  };

  const handleExportAnnualPDF = async () => {
    // Le serveur fournit les donnees completes ; le navigateur ne fait que produire le PDF.
    setDownloadingAnnualPdf(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/annual-report?year=${summaryYear}`, {
        headers: { "X-API-KEY": apiKey },
      });
      if (res.ok) {
        const data = await res.json();
        exportAnnualReportToPDF(data, summaryYear);
      }
    } catch (e) {
      console.error("Erreur téléchargement carnet annuel :", e);
      alert("Impossible de générer le rapport annuel.");
    } finally {
      setDownloadingAnnualPdf(false);
    }
  };

  const refreshSummary = async (yearTarget = summaryYear) => {
    setLoadingSummary(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/admin/summary?year=${yearTarget}`,
        {
          headers: { "X-API-KEY": apiKey },
        },
      );
      if (res.ok) {
        const data = await res.json();
        setSummaryData(data.months || []);
      }
    } catch (e) {
      console.error("Erreur chargement synthèse :", e);
    } finally {
      setLoadingSummary(false);
    }
  };

  const refreshReserves = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/reserves`, {
        headers: { "X-API-KEY": apiKey },
      });
      if (res.ok) {
        const data = await res.json();
        setReserves(data);
      }
    } catch (e) {
      console.error("Erreur chargement réserves :", e);
    }
  };

  const refreshTasks = async () => {
    try {
      const d = new Date();
      const res = await fetch(
        `${API_BASE_URL}/tasks?year=${d.getFullYear()}&month=${d.getMonth() + 1}`,
        { headers: { "X-API-KEY": apiKey } },
      );
      if (res.ok) {
        const data = await res.json();
        setTasksList(data);
      }
    } catch (e) {
      console.error("Erreur chargement tâches :", e);
    }
  };

  const handleDownloadBackup = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/backup-db`, {
        headers: { "X-API-KEY": apiKey },
      });
      if (!res.ok) throw new Error("Erreur de sauvegarde");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup_maintenance_${new Date().toISOString().slice(0, 10)}.db`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Erreur lors du téléchargement de la base de données.");
    }
  };

  useEffect(() => {
    if (!isAdminAuth) return;

    let isMounted = true;

    async function initData() {
      // Ces trois ressources sont independantes et peuvent etre chargees en parallele.
      try {
        const d = new Date();
        const [reservesRes, tasksRes, summaryRes] = await Promise.all([
          fetch(`${API_BASE_URL}/admin/reserves`, {
            headers: { "X-API-KEY": apiKey },
          }),
          fetch(
            `${API_BASE_URL}/tasks?year=${d.getFullYear()}&month=${d.getMonth() + 1}`,
            { headers: { "X-API-KEY": apiKey } },
          ),
          fetch(`${API_BASE_URL}/admin/summary?year=${summaryYear}`, {
            headers: { "X-API-KEY": apiKey },
          }),
        ]);

        if (!isMounted) return;

        if (reservesRes.ok) {
          const reservesData = await reservesRes.json();
          setReserves(reservesData);
        }
        if (tasksRes.ok) {
          const tasksData = await tasksRes.json();
          setTasksList(tasksData);
        }
        if (summaryRes.ok) {
          const summaryResData = await summaryRes.json();
          setSummaryData(summaryResData.months || []);
        }
      } catch (e) {
        console.error("Erreur initialisation admin :", e);
      } finally {
        if (isMounted) setLoadingReserves(false);
      }
    }

    initData();

    return () => {
      isMounted = false;
    };
  }, [isAdminAuth, apiKey, summaryYear]);

  const handleResolve = async (logId) => {
    // Une reserve resolue devient une realisation et conserve sa note dans l'historique.
    try {
      const res = await fetch(
        `${API_BASE_URL}/admin/reserves/${logId}/resolve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": apiKey,
          },
          body: JSON.stringify({
            deletePhoto: deletePhoto,
            resolutionNote: resolutionNote,
            user: localStorage.getItem("pool_user") || "Grégory",
          }),
        },
      );

      if (res.ok) {
        setResolvingId(null);
        setResolutionNote("");
        await refreshReserves();
        await refreshSummary();
        onDataChanged();
      }
    } catch (e) {
      console.error("Erreur levée de réserve :", e);
    }
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      const res = await fetch(`${API_BASE_URL}/admin/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": apiKey,
        },
        body: JSON.stringify({
          title: newTitle.trim(),
          category: newCategory,
          frequency: newFrequency,
          startMonth: Number(newStartMonth),
        }),
      });

      if (res.ok) {
        setNewTitle("");
        await refreshTasks();
        await refreshSummary();
        onDataChanged();
      }
    } catch (e) {
      console.error("Erreur ajout tâche :", e);
    }
  };

  const handleSaveEditTask = async (e) => {
    e.preventDefault();
    if (!editingTask || !editingTask.title.trim()) return;

    try {
      const res = await fetch(`${API_BASE_URL}/admin/tasks/${editingTask.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": apiKey,
        },
        body: JSON.stringify({
          title: editingTask.title.trim(),
          category: editingTask.category,
          frequency: editingTask.frequency,
          startMonth: Number(editingTask.startMonth || 1),
        }),
      });

      if (res.ok) {
        setEditingTask(null);
        await refreshTasks();
        await refreshSummary();
        onDataChanged();
      }
    } catch (e) {
      console.error("Erreur mise à jour tâche :", e);
    }
  };

  const handleDeleteTask = async (taskId, title) => {
    // La confirmation protege aussi l'historique associe a la tache.
    if (
      !window.confirm(
        `Supprimer définitivement la tâche « ${title} » et tout son historique ?`,
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/admin/tasks/${taskId}`, {
        method: "DELETE",
        headers: { "X-API-KEY": apiKey },
      });

      if (res.ok) {
        await refreshTasks();
        await refreshSummary();
        onDataChanged();
      }
    } catch (e) {
      console.error("Erreur suppression tâche :", e);
    }
  };

  const handleClose = () => {
    sessionStorage.removeItem("pool_admin_token");
    setIsAdminAuth(false);
    onClose();
  };

  if (!isAdminAuth) {
    return (
      <div style={modalOverlayStyle}>
        <div
          style={{ ...modalCardStyle, maxWidth: "380px", textAlign: "center" }}
        >
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={handleClose} style={iconBtnStyle}>
              <X size={20} />
            </button>
          </div>
          <div style={{ margin: "10px 0 20px" }}>
            <div
              style={{
                background: "#e0f2fe",
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 12px",
              }}
            >
              <Lock size={24} color="#0284c7" />
            </div>
            <h2
              style={{
                fontSize: "1.2rem",
                fontWeight: "bold",
                color: "#0f172a",
                margin: "0 0 6px",
              }}
            >
              Espace Responsable
            </h2>
            <p style={{ fontSize: "0.85rem", color: "#64748b", margin: 0 }}>
              Saisis le code PIN administrateur :
            </p>
          </div>

          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="Code PIN"
              autoFocus
              style={{
                width: "100%",
                padding: "10px",
                fontSize: "1.1rem",
                textAlign: "center",
                letterSpacing: "4px",
                borderRadius: "8px",
                border: authError ? "2px solid #ef4444" : "1px solid #cbd5e1",
                boxSizing: "border-box",
                marginBottom: "12px",
              }}
            />
            {authError && (
              <p
                style={{
                  color: "#ef4444",
                  fontSize: "0.8rem",
                  margin: "0 0 10px",
                }}
              >
                {authError}
              </p>
            )}
            <button
              type="submit"
              disabled={isVerifying}
              style={primaryBtnStyle}
            >
              {isVerifying ? "Vérification..." : "Déverrouiller"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={modalOverlayStyle}>
      <div
        style={{
          ...modalCardStyle,
          maxWidth: "980px",
          height: "88vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* HEADER ADMIN */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid #e2e8f0",
            paddingBottom: "14px",
            marginBottom: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                background: "#dcfce7",
                padding: "8px",
                borderRadius: "8px",
              }}
            >
              <ShieldAlert size={22} color="#166534" />
            </div>
            <div>
              <h2
                style={{
                  fontSize: "1.25rem",
                  fontWeight: "bold",
                  margin: 0,
                  color: "#0f172a",
                }}
              >
                Administration & Registre
              </h2>
              <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                Accès certifié superviseur
              </span>
            </div>
          </div>
          <button onClick={handleClose} style={iconBtnStyle} title="Fermer">
            <X size={22} />
          </button>
        </div>

        {/* ONGLETS NAVIGATION */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            marginBottom: "16px",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => setActiveTab("summary")}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "0.9rem",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              backgroundColor: activeTab === "summary" ? "#0284c7" : "#f1f5f9",
              color: activeTab === "summary" ? "#ffffff" : "#475569",
            }}
          >
            <BarChart3 size={16} /> Synthèse annuelle
          </button>
          <button
            onClick={() => setActiveTab("reserves")}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "0.9rem",
              backgroundColor: activeTab === "reserves" ? "#0284c7" : "#f1f5f9",
              color: activeTab === "reserves" ? "#ffffff" : "#475569",
            }}
          >
            Réserves en cours ({reserves.length})
          </button>
          <button
            onClick={() => setActiveTab("tasks")}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "0.9rem",
              backgroundColor: activeTab === "tasks" ? "#0284c7" : "#f1f5f9",
              color: activeTab === "tasks" ? "#ffffff" : "#475569",
            }}
          >
            Gestion des tâches ({tasksList.length})
          </button>
          <button
            onClick={() => setActiveTab("security")}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "0.9rem",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              backgroundColor: activeTab === "security" ? "#0284c7" : "#f1f5f9",
              color: activeTab === "security" ? "#ffffff" : "#475569",
            }}
          >
            <KeyRound size={16} /> Sécurité & Système
          </button>
        </div>

        {/* CONTENU ONGLET 1 : SYNTHÈSE ANNUELLE */}
        {activeTab === "summary" && (
          <div style={{ flex: 1, overflowY: "auto", paddingRight: "4px" }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "10px",
                marginBottom: "14px",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1rem", color: "#1e293b" }}>
                Bilan de réalisation sur l'année {summaryYear}
              </h3>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <button
                  onClick={() => {
                    const next = summaryYear - 1;
                    setSummaryYear(next);
                    refreshSummary(next);
                  }}
                  style={{
                    ...primaryBtnStyle,
                    backgroundColor: "#e2e8f0",
                    color: "#334155",
                  }}
                >
                  Année précédente
                </button>
                <button
                  onClick={() => {
                    const next = summaryYear + 1;
                    setSummaryYear(next);
                    refreshSummary(next);
                  }}
                  style={{
                    ...primaryBtnStyle,
                    backgroundColor: "#e2e8f0",
                    color: "#334155",
                  }}
                >
                  Année suivante
                </button>
                <button
                  onClick={handleExportAnnualPDF}
                  disabled={downloadingAnnualPdf}
                  style={{
                    ...primaryBtnStyle,
                    backgroundColor: "#059669",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                  title="Télécharger l'intégralité du carnet annuel (12 mois)"
                >
                  <FileDown size={16} />
                  {downloadingAnnualPdf ? "Génération PDF..." : "Exporter Car. Annuel PDF"}
                </button>
              </div>
            </div>

            {loadingSummary ? (
              <p style={{ color: "#64748b" }}>
                Calcul des statistiques annuelles...
              </p>
            ) : (
              <div
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "10px",
                  overflow: "hidden",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "0.85rem",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background: "#f8fafc",
                        textAlign: "left",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      <th style={{ padding: "10px 14px" }}>Mois</th>
                      <th style={{ padding: "10px 14px" }}>Dues</th>
                      <th style={{ padding: "10px 14px", color: "#16a34a" }}>
                        Faites
                      </th>
                      <th style={{ padding: "10px 14px", color: "#d97706" }}>
                        Réserves
                      </th>
                      <th style={{ padding: "10px 14px", color: "#ef4444" }}>
                        Restantes
                      </th>
                      <th style={{ padding: "10px 14px", width: "220px" }}>
                        Taux de réalisation
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryData.map((m) => (
                      <tr
                        key={m.month}
                        style={{ borderBottom: "1px solid #f1f5f9" }}
                      >
                        <td
                          style={{
                            padding: "10px 14px",
                            fontWeight: "600",
                            color: "#1e293b",
                          }}
                        >
                          {MONTH_NAMES[m.month - 1]}
                        </td>
                        <td style={{ padding: "10px 14px", fontWeight: "500" }}>
                          {m.dueCount}
                        </td>
                        <td
                          style={{
                            padding: "10px 14px",
                            color: "#16a34a",
                            fontWeight: "600",
                          }}
                        >
                          {m.doneCount}
                        </td>
                        <td
                          style={{
                            padding: "10px 14px",
                            color: "#d97706",
                            fontWeight: "600",
                          }}
                        >
                          {m.reserveCount}
                        </td>
                        <td
                          style={{
                            padding: "10px 14px",
                            color: "#ef4444",
                            fontWeight: "600",
                          }}
                        >
                          {m.todoCount}
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            <div
                              style={{
                                flex: 1,
                                height: "8px",
                                background: "#e2e8f0",
                                borderRadius: "4px",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  width: `${m.rate}%`,
                                  height: "100%",
                                  background:
                                    m.rate === 100
                                      ? "#16a34a"
                                      : m.rate >= 50
                                        ? "#0284c7"
                                        : "#f59e0b",
                                  borderRadius: "4px",
                                }}
                              />
                            </div>
                            <span
                              style={{
                                minWidth: "35px",
                                fontSize: "0.8rem",
                                fontWeight: "bold",
                                textAlign: "right",
                              }}
                            >
                              {m.rate}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* CONTENU ONGLET 2 : RÉSOLUTIONS DE RÉSERVES */}
        {activeTab === "reserves" && (
          <div style={{ flex: 1, overflowY: "auto", paddingRight: "4px" }}>
            {loadingReserves ? (
              <p style={{ color: "#64748b" }}>Chargement du registre...</p>
            ) : reserves.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "40px",
                  color: "#166534",
                  background: "#f0fdf4",
                  borderRadius: "12px",
                  border: "1px dashed #86efac",
                }}
              >
                <CheckCircle
                  size={36}
                  style={{ margin: "0 auto 8px", display: "block" }}
                />
                <strong>Aucune réserve active !</strong>
                <p style={{ margin: "4px 0 0", fontSize: "0.85rem" }}>
                  Toutes les vérifications signalées ont été traitées.
                </p>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                {reserves.map((r) => (
                  <div
                    key={r.logId}
                    style={{
                      border: "1px solid #fde68a",
                      background: "#fffbeb",
                      borderRadius: "10px",
                      padding: "14px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: "10px",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            marginBottom: "4px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "0.75rem",
                              background: "#fed7aa",
                              color: "#9a3412",
                              padding: "2px 8px",
                              borderRadius: "12px",
                              fontWeight: "bold",
                            }}
                          >
                            {MONTH_NAMES[r.month - 1]} {r.year}
                          </span>
                          <span
                            style={{ fontSize: "0.75rem", color: "#64748b" }}
                          >
                            {r.category}
                          </span>
                        </div>
                        <h4
                          style={{
                            margin: "0 0 6px",
                            fontSize: "1rem",
                            color: "#1e293b",
                          }}
                        >
                          {r.taskTitle}
                        </h4>
                        <div
                          style={{
                            fontSize: "0.85rem",
                            color: "#92400e",
                            background: "#fef3c7",
                            padding: "8px 12px",
                            borderRadius: "6px",
                            borderLeft: "4px solid #f59e0b",
                          }}
                        >
                          <strong>Signalement :</strong>{" "}
                          {r.observation || "Aucune précision"}
                        </div>
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "#64748b",
                            marginTop: "6px",
                          }}
                        >
                          Signalé par <strong>{r.updatedBy || "Agent"}</strong>
                        </div>
                      </div>

                      {r.photoUrl && (
                        <div style={{ textAlign: "center" }}>
                          <img
                            src={`https://vericelgregory.alwaysdata.net/piscine${r.photoUrl}`}
                            alt="Preuve"
                            onClick={() =>
                              onPreviewImage(
                                `https://vericelgregory.alwaysdata.net/piscine${r.photoUrl}`,
                              )
                            }
                            style={{
                              width: "64px",
                              height: "64px",
                              objectFit: "cover",
                              borderRadius: "6px",
                              border: "1px solid #cbd5e1",
                              cursor: "pointer",
                            }}
                            title="Cliquer pour agrandir"
                          />
                          <span
                            style={{
                              display: "block",
                              fontSize: "0.65rem",
                              color: "#64748b",
                              marginTop: "2px",
                            }}
                          >
                            Agrandir
                          </span>
                        </div>
                      )}
                    </div>

                    {resolvingId === r.logId ? (
                      <div
                        style={{
                          marginTop: "12px",
                          paddingTop: "12px",
                          borderTop: "1px dashed #fcd34d",
                        }}
                      >
                        <textarea
                          placeholder="Note de résolution (ex : Vanne changée, joint refait...)"
                          value={resolutionNote}
                          onChange={(e) => setResolutionNote(e.target.value)}
                          rows={2}
                          style={{
                            width: "100%",
                            padding: "8px",
                            boxSizing: "border-box",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            fontSize: "0.85rem",
                            marginBottom: "8px",
                          }}
                        />
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <label
                            style={{
                              fontSize: "0.8rem",
                              color: "#475569",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={deletePhoto}
                              onChange={(e) => setDeletePhoto(e.target.checked)}
                            />
                            Supprimer la photo du serveur (libérer l'espace)
                          </label>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              onClick={() => setResolvingId(null)}
                              style={{
                                background: "#e2e8f0",
                                border: "none",
                                padding: "6px 12px",
                                borderRadius: "6px",
                                cursor: "pointer",
                                fontSize: "0.8rem",
                              }}
                            >
                              Annuler
                            </button>
                            <button
                              onClick={() => handleResolve(r.logId)}
                              style={{
                                background: "#16a34a",
                                color: "white",
                                border: "none",
                                padding: "6px 12px",
                                borderRadius: "6px",
                                cursor: "pointer",
                                fontSize: "0.8rem",
                                fontWeight: "bold",
                              }}
                            >
                              Confirmer & Valider en vert
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          marginTop: "10px",
                          display: "flex",
                          justifyContent: "flex-end",
                        }}
                      >
                        <button
                          onClick={() => {
                            setResolvingId(r.logId);
                            setResolutionNote("");
                            setDeletePhoto(true);
                          }}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            backgroundColor: "#16a34a",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            padding: "6px 12px",
                            fontSize: "0.8rem",
                            fontWeight: "bold",
                            cursor: "pointer",
                          }}
                        >
                          <CheckCircle size={15} /> Résoudre l'anomalie
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CONTENU ONGLET 3 : GESTION & ÉDITION DES TÂCHES */}
        {activeTab === "tasks" && (
          <div style={{ flex: 1, overflowY: "auto", paddingRight: "4px" }}>
            {/* FORMULAIRE D'AJOUT OU D'ÉDITION */}
            <form
              onSubmit={editingTask ? handleSaveEditTask : handleAddTask}
              style={{
                background: editingTask ? "#eff6ff" : "#f8fafc",
                padding: "14px",
                borderRadius: "10px",
                border: editingTask ? "1px solid #93c5fd" : "1px solid #e2e8f0",
                marginBottom: "16px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <h4
                  style={{
                    margin: 0,
                    fontSize: "0.95rem",
                    color: editingTask ? "#1d4ed8" : "#1e293b",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  {editingTask ? (
                    <>
                      <Pencil size={16} color="#2563eb" /> Modifier le point de contrôle
                    </>
                  ) : (
                    <>
                      <PlusCircle size={16} color="#0284c7" /> Ajouter un nouveau point de contrôle
                    </>
                  )}
                </h4>
                {editingTask && (
                  <button
                    type="button"
                    onClick={() => setEditingTask(null)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#64748b",
                      fontSize: "0.78rem",
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    Annuler l'édition
                  </button>
                )}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "10px",
                  marginBottom: "10px",
                }}
              >
                <div>
                  <label style={labelStyle}>Libellé du contrôle :</label>
                  <input
                    type="text"
                    value={editingTask ? editingTask.title : newTitle}
                    onChange={(e) =>
                      editingTask
                        ? setEditingTask({ ...editingTask, title: e.target.value })
                        : setNewTitle(e.target.value)
                    }
                    placeholder="Ex: Contrôler la fermeture automatique..."
                    required
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Catégorie :</label>
                  <select
                    value={editingTask ? editingTask.category : newCategory}
                    onChange={(e) =>
                      editingTask
                        ? setEditingTask({ ...editingTask, category: e.target.value })
                        : setNewCategory(e.target.value)
                    }
                    style={inputStyle}
                  >
                    <option value="Sécurité Incendie">Sécurité Incendie</option>
                    <option value="Électricité / Éclairage">
                      Électricité / Éclairage
                    </option>
                    <option value="Sanitaires / Plomberie">
                      Sanitaires / Plomberie
                    </option>
                    <option value="Ventilation">Ventilation</option>
                    <option value="Équipements sportifs">
                      Équipements sportifs
                    </option>
                    <option value="Vestiaires / Casiers">
                      Vestiaires / Casiers
                    </option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Fréquence :</label>
                  <select
                    value={editingTask ? editingTask.frequency : newFrequency}
                    onChange={(e) =>
                      editingTask
                        ? setEditingTask({ ...editingTask, frequency: e.target.value })
                        : setNewFrequency(e.target.value)
                    }
                    style={inputStyle}
                  >
                    <option value="Mensuel">Mensuel</option>
                    <option value="Trimestriel">Trimestriel</option>
                    <option value="Semestriel">Semestriel</option>
                    <option value="Annuel">Annuel</option>
                  </select>
                </div>
                {(editingTask ? editingTask.frequency : newFrequency) !== "Mensuel" && (
                  <div>
                    <label style={labelStyle}>1er mois d'échéance :</label>
                    <select
                      value={editingTask ? (editingTask.startMonth || 1) : newStartMonth}
                      onChange={(e) =>
                        editingTask
                          ? setEditingTask({ ...editingTask, startMonth: Number(e.target.value) })
                          : setNewStartMonth(e.target.value)
                      }
                      style={inputStyle}
                    >
                      {MONTH_NAMES.map((name, idx) => (
                        <option key={idx + 1} value={idx + 1}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <button
                type="submit"
                style={{
                  ...primaryBtnStyle,
                  backgroundColor: editingTask ? "#2563eb" : "#0284c7",
                }}
              >
                {editingTask ? "Enregistrer les modifications" : "Ajouter la vérification"}
              </button>
            </form>

            {/* LISTE DES TÂCHES (CARDS) AVEC BOUTON D'ÉDITION & SUPPRESSION */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                marginTop: "12px",
              }}
            >
              {tasksList.map((t) => (
                <div
                  key={t.id}
                  style={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "10px",
                    padding: "12px 14px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        flexWrap: "wrap",
                        marginBottom: "4px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: "600",
                          backgroundColor: "#f1f5f9",
                          color: "#475569",
                          padding: "2px 8px",
                          borderRadius: "6px",
                        }}
                      >
                        {t.category}
                      </span>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: "600",
                          backgroundColor: "#e0f2fe",
                          color: "#0369a1",
                          padding: "2px 8px",
                          borderRadius: "6px",
                        }}
                      >
                        {t.frequency}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "0.92rem",
                        fontWeight: "500",
                        color: "#0f172a",
                        lineHeight: "1.35",
                        wordBreak: "break-word",
                      }}
                    >
                      {t.title}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                    <button
                      onClick={() => {
                        setEditingTask({
                          id: t.id,
                          title: t.title,
                          category: t.category,
                          frequency: t.frequency,
                          startMonth: t.startMonth || 1,
                        });
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      style={{
                        border: "none",
                        backgroundColor: "#f1f5f9",
                        color: "#334155",
                        padding: "8px",
                        borderRadius: "8px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      title="Modifier cette vérification"
                    >
                      <Pencil size={15} />
                    </button>

                    <button
                      onClick={() => handleDeleteTask(t.id, t.title)}
                      style={{
                        border: "none",
                        backgroundColor: "#fee2e2",
                        color: "#ef4444",
                        padding: "8px",
                        borderRadius: "8px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      title="Supprimer la vérification"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CONTENU ONGLET 4 : SÉCURITÉ & MAINTENANCE SYSTÈME */}
        {activeTab === "security" && (
          <div style={{ flex: 1, overflowY: "auto", paddingRight: "4px" }}>
            <div
              style={{
                maxWidth: "480px",
                margin: "0 auto",
                background: "#f8fafc",
                padding: "20px",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
              }}
            >
              <h3
                style={{
                  margin: "0 0 10px",
                  fontSize: "1rem",
                  color: "#1e293b",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <KeyRound size={18} color="#0284c7" /> Modifier le code PIN Administrateur
              </h3>
              <p
                style={{
                  fontSize: "0.85rem",
                  color: "#64748b",
                  margin: "0 0 16px",
                }}
              >
                Le code PIN protège l'accès à ce panneau de contrôle et au registre des anomalies.
              </p>

              {pinChangeMsg.text && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: "6px",
                    fontSize: "0.85rem",
                    marginBottom: "14px",
                    backgroundColor:
                      pinChangeMsg.type === "success" ? "#dcfce7" : "#fee2e2",
                    color:
                      pinChangeMsg.type === "success" ? "#166534" : "#991b1b",
                    border: `1px solid ${pinChangeMsg.type === "success" ? "#86efac" : "#fca5a5"}`,
                  }}
                >
                  {pinChangeMsg.text}
                </div>
              )}

              <form onSubmit={handleUpdatePin}>
                <div style={{ marginBottom: "12px" }}>
                  <label style={labelStyle}>Code PIN actuel :</label>
                  <input
                    type="password"
                    value={oldPin}
                    onChange={(e) => setOldPin(e.target.value)}
                    required
                    placeholder="PIN actuel (ex: 2026)"
                    style={inputStyle}
                  />
                </div>
                <div style={{ marginBottom: "16px" }}>
                  <label style={labelStyle}>
                    Nouveau code PIN (min. 4 caractères) :
                  </label>
                  <input
                    type="password"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    required
                    placeholder="Nouveau code PIN"
                    style={inputStyle}
                  />
                </div>
                <button type="submit" style={primaryBtnStyle}>
                  Enregistrer le nouveau code PIN
                </button>
              </form>

              {/* NETTOYAGE DU STOCKAGE PHOTOS */}
              <div
                style={{
                  marginTop: "24px",
                  paddingTop: "18px",
                  borderTop: "1px solid #e2e8f0",
                }}
              >
                <h4
                  style={{
                    margin: "0 0 6px",
                    fontSize: "0.95rem",
                    color: "#1e293b",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <Sparkles size={17} color="#0284c7" /> Nettoyage du stockage (Photos orphelines)
                </h4>
                <p
                  style={{
                    fontSize: "0.82rem",
                    color: "#64748b",
                    margin: "0 0 12px",
                  }}
                >
                  Supprime sur le serveur Alwaysdata les photos d'anomalies résolues qui ne sont plus reliées à aucun contrôle.
                </p>
                {cleanupResult && (
                  <div
                    style={{
                      fontSize: "0.82rem",
                      color: "#166534",
                      backgroundColor: "#f0fdf4",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #bbf7d0",
                      marginBottom: "10px",
                    }}
                  >
                    {cleanupResult}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleCleanupPhotos}
                  disabled={cleaningPhotos}
                  style={{
                    ...primaryBtnStyle,
                    backgroundColor: "#475569",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Sparkles size={15} />
                  {cleaningPhotos ? "Nettoyage en cours..." : "Purger les photos orphelines"}
                </button>
              </div>

              {/* SAUVEGARDE DIRECTE SQLITE */}
              <div
                style={{
                  marginTop: "20px",
                  paddingTop: "18px",
                  borderTop: "1px solid #e2e8f0",
                }}
              >
                <h4
                  style={{
                    margin: "0 0 6px",
                    fontSize: "0.95rem",
                    color: "#1e293b",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <Database size={17} color="#0284c7" /> Sauvegarde de la base de données
                </h4>
                <p
                  style={{
                    fontSize: "0.82rem",
                    color: "#64748b",
                    margin: "0 0 12px",
                  }}
                >
                  Télécharge une copie instantanée du fichier SQLite contenant tout l'historique des vérifications.
                </p>
                <button
                  type="button"
                  onClick={handleDownloadBackup}
                  style={{
                    ...primaryBtnStyle,
                    backgroundColor: "#059669",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Database size={15} /> Télécharger la sauvegarde (.db)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// STYLES EN LIGNE
const modalOverlayStyle = {
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
  zIndex: 9998,
  padding: "16px",
  boxSizing: "border-box",
};

const modalCardStyle = {
  backgroundColor: "#ffffff",
  borderRadius: "14px",
  width: "100%",
  boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
  padding: "20px",
  boxSizing: "border-box",
};

const primaryBtnStyle = {
  backgroundColor: "#0284c7",
  color: "white",
  border: "none",
  borderRadius: "6px",
  padding: "8px 16px",
  fontWeight: "bold",
  fontSize: "0.85rem",
  cursor: "pointer",
};

const iconBtnStyle = {
  background: "none",
  border: "none",
  color: "#64748b",
  cursor: "pointer",
  padding: "4px",
};

const labelStyle = {
  display: "block",
  fontSize: "0.78rem",
  fontWeight: "600",
  color: "#475569",
  marginBottom: "4px",
};

const inputStyle = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: "6px",
  border: "1px solid #cbd5e1",
  boxSizing: "border-box",
  fontSize: "0.85rem",
};