import { useState, useEffect } from "react";
import {
  ShieldAlert,
  PlusCircle,
  Trash2,
  CheckCircle,
  X,
  Lock,
} from "lucide-react";
import { getApiKey } from "./syncService";

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

export default function AdminDashboard({ onClose, onDataChanged, onPreviewImage }) {
  const [isAdminAuth, setIsAdminAuth] = useState(
    () => sessionStorage.getItem("pool_admin_session") === "true"
  );
  const [pinInput, setPinInput] = useState("");
  const [authError, setAuthError] = useState(false);
  const [activeTab, setActiveTab] = useState("reserves"); // "reserves" | "tasks"

  // États pour les réserves
  const [reserves, setReserves] = useState([]);
  const [loadingReserves, setLoadingReserves] = useState(() => isAdminAuth);
  const [resolvingId, setResolvingId] = useState(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [deletePhoto, setDeletePhoto] = useState(true);

  // États pour les tâches
  const [tasksList, setTasksList] = useState([]);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("Sécurité Incendie");
  const [newFrequency, setNewFrequency] = useState("Mensuel");
  const [newStartMonth, setNewStartMonth] = useState(1);

  const apiKey = getApiKey();

  // 1. Authentification Admin via PIN (par défaut "2026", personnalisable)
  const handleLogin = (e) => {
    e.preventDefault();
    if (pinInput === "2026") {
      setIsAdminAuth(true);
      sessionStorage.setItem("pool_admin_session", "true");
      setAuthError(false);
    } else {
      setAuthError(true);
    }
  };

  // Fonctions de rechargement manuel (après une action)
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
        { headers: { "X-API-KEY": apiKey } }
      );
      if (res.ok) {
        const data = await res.json();
        setTasksList(data);
      }
    } catch (e) {
      console.error("Erreur chargement tâches :", e);
    }
  };

  useEffect(() => {
    if (!isAdminAuth) return;

    let isMounted = true;

    async function initData() {
      try {
        const d = new Date();
        const [reservesRes, tasksRes] = await Promise.all([
          fetch(`${API_BASE_URL}/admin/reserves`, {
            headers: { "X-API-KEY": apiKey },
          }),
          fetch(
            `${API_BASE_URL}/tasks?year=${d.getFullYear()}&month=${d.getMonth() + 1}`,
            { headers: { "X-API-KEY": apiKey } }
          ),
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
  }, [isAdminAuth, apiKey]);

  // 4. Clôturer une réserve (passer en vert + supprimer photo)
  const handleResolve = async (logId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/reserves/${logId}/resolve`, {
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
      });

      if (res.ok) {
        setResolvingId(null);
        setResolutionNote("");
        await refreshReserves();
        onDataChanged();
      }
    } catch (e) {
      console.error("Erreur levée de réserve :", e);
    }
  };

  // 5. Créer une nouvelle vérification
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
        onDataChanged();
      }
    } catch (e) {
      console.error("Erreur ajout tâche :", e);
    }
  };

  // 6. Supprimer une tâche
  const handleDeleteTask = async (taskId, title) => {
    if (!window.confirm(`Supprimer définitivement la tâche « ${title} » et tout son historique ?`)) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/admin/tasks/${taskId}`, {
        method: "DELETE",
        headers: { "X-API-KEY": apiKey },
      });

      if (res.ok) {
        await refreshTasks();
        onDataChanged();
      }
    } catch (e) {
      console.error("Erreur suppression tâche :", e);
    }
  };

  // Écran de verrouillage / saisie du code PIN
  if (!isAdminAuth) {
    return (
      <div style={modalOverlayStyle}>
        <div style={{ ...modalCardStyle, maxWidth: "380px", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={onClose} style={iconBtnStyle}><X size={20} /></button>
          </div>
          <div style={{ margin: "10px 0 20px" }}>
            <div style={{ background: "#e0f2fe", width: "48px", height: "48px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
              <Lock size={24} color="#0284c7" />
            </div>
            <h2 style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#0f172a", margin: "0 0 6px" }}>Espace Responsable</h2>
            <p style={{ fontSize: "0.85rem", color: "#64748b", margin: 0 }}>Saisis le code PIN administrateur :</p>
          </div>

          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="Code PIN (2026)"
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
            {authError && <p style={{ color: "#ef4444", fontSize: "0.8rem", margin: "0 0 10px" }}>Code PIN erroné</p>}
            <button type="submit" style={primaryBtnStyle}>Déverrouiller</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={modalOverlayStyle}>
      <div style={{ ...modalCardStyle, maxWidth: "950px", height: "85vh", display: "flex", flexDirection: "column" }}>
        
        {/* HEADER ADMIN */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e2e8f0", paddingBottom: "14px", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ background: "#dcfce7", padding: "8px", borderRadius: "8px" }}>
              <ShieldAlert size={22} color="#166534" />
            </div>
            <div>
              <h2 style={{ fontSize: "1.25rem", fontWeight: "bold", margin: 0, color: "#0f172a" }}>Administration & Registre</h2>
              <span style={{ fontSize: "0.8rem", color: "#64748b" }}>Accès certifié superviseur</span>
            </div>
          </div>
          <button onClick={onClose} style={iconBtnStyle} title="Fermer"><X size={22} /></button>
        </div>

        {/* ONGLETS NAVIGATION */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
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
        </div>

        {/* CONTENU ONGLET 1 : RÉSOLUTIONS DE RÉSERVES */}
        {activeTab === "reserves" && (
          <div style={{ flex: 1, overflowY: "auto", paddingRight: "4px" }}>
            {loadingReserves ? (
              <p style={{ color: "#64748b" }}>Chargement du registre...</p>
            ) : reserves.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#166534", background: "#f0fdf4", borderRadius: "12px", border: "1px dashed #86efac" }}>
                <CheckCircle size={36} style={{ margin: "0 auto 8px", display: "block" }} />
                <strong>Aucune réserve active !</strong>
                <p style={{ margin: "4px 0 0", fontSize: "0.85rem" }}>Toutes les vérifications signalées ont été traitées.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {reserves.map((r) => (
                  <div key={r.logId} style={{ border: "1px solid #fde68a", background: "#fffbeb", borderRadius: "10px", padding: "14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                          <span style={{ fontSize: "0.75rem", background: "#fed7aa", color: "#9a3412", padding: "2px 8px", borderRadius: "12px", fontWeight: "bold" }}>
                            {MONTH_NAMES[r.month - 1]} {r.year}
                          </span>
                          <span style={{ fontSize: "0.75rem", color: "#64748b" }}>{r.category}</span>
                        </div>
                        <h4 style={{ margin: "0 0 6px", fontSize: "1rem", color: "#1e293b" }}>{r.taskTitle}</h4>
                        <div style={{ fontSize: "0.85rem", color: "#92400e", background: "#fef3c7", padding: "8px 12px", borderRadius: "6px", borderLeft: "4px solid #f59e0b" }}>
                          <strong>Signalement :</strong> {r.observation || "Aucune précision"}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "6px" }}>
                          Signalé par <strong>{r.updatedBy || "Agent"}</strong>
                        </div>
                      </div>

                      {r.photoUrl && (
                        <div style={{ textAlign: "center" }}>
                          <img
                            src={`https://vericelgregory.alwaysdata.net/piscine${r.photoUrl}`}
                            alt="Preuve"
                            onClick={() => onPreviewImage(`https://vericelgregory.alwaysdata.net/piscine${r.photoUrl}`)}
                            style={{ width: "64px", height: "64px", objectFit: "cover", borderRadius: "6px", border: "1px solid #cbd5e1", cursor: "pointer" }}
                            title="Cliquer pour agrandir"
                          />
                          <span style={{ display: "block", fontSize: "0.65rem", color: "#64748b", marginTop: "2px" }}>Agrandir</span>
                        </div>
                      )}
                    </div>

                    {/* BLOC FORMULAIRE DE RÉSOLUTION */}
                    {resolvingId === r.logId ? (
                      <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px dashed #fcd34d" }}>
                        <textarea
                          placeholder="Note de résolution (ex : Vanne changée, joint refait...)"
                          value={resolutionNote}
                          onChange={(e) => setResolutionNote(e.target.value)}
                          rows={2}
                          style={{ width: "100%", padding: "8px", boxSizing: "border-box", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.85rem", marginBottom: "8px" }}
                        />
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <label style={{ fontSize: "0.8rem", color: "#475569", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={deletePhoto}
                              onChange={(e) => setDeletePhoto(e.target.checked)}
                            />
                            Supprimer la photo du serveur (libérer l'espace)
                          </label>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button onClick={() => setResolvingId(null)} style={{ background: "#e2e8f0", border: "none", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "0.8rem" }}>Annuler</button>
                            <button onClick={() => handleResolve(r.logId)} style={{ background: "#16a34a", color: "white", border: "none", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "0.8rem", fontWeight: "bold" }}>Confirmer & Valider en vert</button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginTop: "10px", display: "flex", justifyContent: "flex-end" }}>
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

        {/* CONTENU ONGLET 2 : GESTION DES TÂCHES */}
        {activeTab === "tasks" && (
          <div style={{ flex: 1, overflowY: "auto", paddingRight: "4px" }}>
            {/* Formulaire d'ajout */}
            <form onSubmit={handleAddTask} style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
              <h4 style={{ margin: "0 0 10px", fontSize: "0.95rem", color: "#1e293b", display: "flex", alignItems: "center", gap: "6px" }}>
                <PlusCircle size={16} color="#0284c7" /> Ajouter un nouveau point de contrôle
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px", marginBottom: "10px" }}>
                <div>
                  <label style={labelStyle}>Libellé du contrôle :</label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Ex: Contrôler la fermeture automatique..."
                    required
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Catégorie :</label>
                  <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} style={inputStyle}>
                    <option value="Sécurité Incendie">Sécurité Incendie</option>
                    <option value="Électricité / Éclairage">Électricité / Éclairage</option>
                    <option value="Sanitaires / Plomberie">Sanitaires / Plomberie</option>
                    <option value="Ventilation">Ventilation</option>
                    <option value="Équipements sportifs">Équipements sportifs</option>
                    <option value="Vestiaires / Casiers">Vestiaires / Casiers</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Fréquence :</label>
                  <select value={newFrequency} onChange={(e) => setNewFrequency(e.target.value)} style={inputStyle}>
                    <option value="Mensuel">Mensuel</option>
                    <option value="Trimestriel">Trimestriel</option>
                    <option value="Semestriel">Semestriel</option>
                    <option value="Annuel">Annuel</option>
                  </select>
                </div>
                {newFrequency !== "Mensuel" && (
                  <div>
                    <label style={labelStyle}>1er mois d'échéance :</label>
                    <select value={newStartMonth} onChange={(e) => setNewStartMonth(e.target.value)} style={inputStyle}>
                      {MONTH_NAMES.map((name, idx) => (
                        <option key={idx + 1} value={idx + 1}>{name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <button type="submit" style={primaryBtnStyle}>Ajouter la vérification</button>
            </form>

            {/* Listing des tâches existantes */}
            <div style={{ border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "10px 14px" }}>Contrôle</th>
                    <th style={{ padding: "10px 14px" }}>Catégorie</th>
                    <th style={{ padding: "10px 14px" }}>Fréquence</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tasksList.map((t) => (
                    <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "10px 14px", fontWeight: "500", color: "#1e293b" }}>{t.title}</td>
                      <td style={{ padding: "10px 14px", color: "#64748b" }}>{t.category}</td>
                      <td style={{ padding: "10px 14px", color: "#64748b" }}>{t.frequency}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>
                        <button
                          onClick={() => handleDeleteTask(t.id, t.title)}
                          style={{ border: "none", background: "#fee2e2", color: "#ef4444", padding: "6px 8px", borderRadius: "6px", cursor: "pointer" }}
                          title="Supprimer la vérification"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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