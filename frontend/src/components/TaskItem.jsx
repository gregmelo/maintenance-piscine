import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Circle,
  History,
  MessageSquare,
  Map,
} from "lucide-react";

const PHOTO_BASE_URL = "https://vericelgregory.alwaysdata.net/piscine";

export default function TaskItem({
  task,
  notes,
  photos,
  planPins = [],
  pinStates = {},
  onStatusChange,
  onNoteChange,
  onPhotoChange,
  onSaveNote,
  onOpenHistory,
  onOpenPlan,
  onPreviewImage,
  formatCompletedAt,
}) {
  const isDue = task.isDue;
  const isWarning = task.status === "RESERVE";
  const hasNote = Boolean(
    task.observation && task.observation.trim().length > 0,
  );
  const photo = photos[task.id] || task.photoUrl;
  const photoUrl = photos[task.id] || `${PHOTO_BASE_URL}${task.photoUrl}`;

  const titleLower = (task.title || "").toLowerCase();

  // Détection du calque associé
  let targetLayer = null;
  if (titleLower.includes("extincteur")) targetLayer = "extincteur";
  else if (titleLower.includes("baes") || titleLower.includes("secours"))
    targetLayer = "baes";
  else if (
    titleLower.includes("désenfumage") ||
    titleLower.includes("desenfumage")
  )
    targetLayer = "desenfumage";
  else if (
    titleLower.includes("coupure") ||
    titleLower.includes("gaz") ||
    titleLower.includes("tgbt")
  )
    targetLayer = "coupure";

  // Calcul de la progression et des anomalies sur le plan
  let planStats = null;
  if (targetLayer && planPins.length > 0) {
    const relatedPins = planPins.filter((p) => p.type === targetLayer);
    if (relatedPins.length > 0) {
      let verifiedCount = 0;
      let reserveCount = 0;

      relatedPins.forEach((p) => {
        const st = pinStates[p.id]?.status;
        if (st === "FAIT") verifiedCount++;
        else if (st === "RESERVE") {
          verifiedCount++;
          reserveCount++;
        }
      });

      const percent = Math.round((verifiedCount / relatedPins.length) * 100);
      planStats = {
        total: relatedPins.length,
        verified: verifiedCount,
        reserves: reserveCount,
        percent,
      };
    }
  }

  const handleOpenPlanForTask = (e) => {
    e.stopPropagation();
    if (onOpenPlan) {
      onOpenPlan(targetLayer || "all");
    }
  };

  return (
    <div className={`task-row ${isDue ? "" : "is-not-due"}`}>
      <div className="task-main">
        <div className="task-details">
          <div className="task-heading">
            <span className="task-title">{task.title}</span>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              {targetLayer && onOpenPlan && (
                <button
                  type="button"
                  onClick={handleOpenPlanForTask}
                  className="history-trigger no-print"
                  style={{ color: "#d97706" }}
                  title="Ouvrir sur le plan"
                >
                  <Map size={14} />
                </button>
              )}

              <button
                type="button"
                onClick={() => onOpenHistory(task)}
                className="history-trigger no-print"
                title="Consulter l'historique"
              >
                <History size={14} />
              </button>
            </div>
          </div>

          {/* JAUGE DE PROGRESSION LIÉE AU PLAN */}
          {planStats && (
            <div style={{ margin: "6px 0 2px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.74rem",
                  fontWeight: "600",
                  color:
                    planStats.reserves > 0
                      ? "#d97706"
                      : planStats.percent === 100
                        ? "#16a34a"
                        : "#0284c7",
                }}
              >
                <span>
                  {planStats.reserves > 0
                    ? `Contrôlés : ${planStats.verified} / ${planStats.total} (${planStats.reserves} réserve${planStats.reserves > 1 ? "s" : ""})`
                    : `Contrôlés sur plan : ${planStats.verified} / ${planStats.total}`}
                </span>
                <span>{planStats.percent}%</span>
              </div>
              <div
                style={{
                  width: "100%",
                  height: "5px",
                  background: "#e2e8f0",
                  borderRadius: "3px",
                  overflow: "hidden",
                  marginTop: "2px",
                }}
              >
                <div
                  style={{
                    width: `${planStats.percent}%`,
                    height: "100%",
                    background:
                      planStats.reserves > 0
                        ? "#f59e0b"
                        : planStats.percent === 100
                          ? "#22c55e"
                          : "#0284c7",
                    transition: "width 0.3s ease, background-color 0.3s ease",
                  }}
                />
              </div>
            </div>
          )}

          <div className="task-meta">
            <span>{task.frequency}</span>
            {!isDue && <span className="not-due-label">• Non dû ce mois</span>}
            {task.status !== "A_FAIRE" && task.updatedBy && (
              <span className="validated-by">
                • Validé par <strong>{task.updatedBy}</strong>
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

        {isDue ? (
          <div className="task-actions no-print">
            <button
              onClick={() => onStatusChange(task.id, "FAIT")}
              className={`status-button ${task.status === "FAIT" ? "is-done" : ""}`}
              title="Fait"
            >
              <CheckCircle2 size={18} />
            </button>
            <button
              onClick={() => onStatusChange(task.id, "RESERVE")}
              className={`status-button ${isWarning ? "is-reserved" : ""}`}
              title="Réserve / Attention"
            >
              <AlertTriangle size={18} />
            </button>
            <button
              onClick={() => onStatusChange(task.id, "A_FAIRE")}
              className={`status-button ${task.status === "A_FAIRE" ? "is-todo" : ""}`}
              title="À faire"
            >
              <Circle size={18} />
            </button>
          </div>
        ) : (
          <span className="not-due-placeholder">—</span>
        )}
      </div>

      {isDue && isWarning && (
        <div className="reserve-editor">
          <label className="reserve-label">
            <MessageSquare size={14} /> Préciser l'anomalie / réserve constatée
            :
          </label>
          <textarea
            value={notes[task.id] ?? task.observation ?? ""}
            onChange={(event) => onNoteChange(task.id, event.target.value)}
            placeholder="Ex. Fuite constatée, vis manquante, pièce à commander..."
            rows={2}
            className="reserve-textarea"
          />
          <div className="photo-actions">
            <label className="photo-upload no-print">
              <Camera size={16} /> Ajouter une photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) =>
                  onPhotoChange(task.id, event.target.files[0])
                }
              />
            </label>
            {photo && (
              <img
                src={photoUrl}
                alt="Aperçu réserve"
                onClick={() => onPreviewImage(photoUrl)}
                className="task-photo preview"
                title="Cliquer pour agrandir l'image"
              />
            )}
          </div>
          <div className="save-note-row no-print">
            <button
              onClick={() => onSaveNote(task)}
              className="save-note-button"
            >
              Enregistrer la note
            </button>
          </div>
        </div>
      )}

      {isDue && !isWarning && hasNote && (
        <div className="existing-note">
          <div>
            <strong>Note précédente :</strong> {task.observation}
          </div>
          {task.photoUrl && (
            <img
              src={`${PHOTO_BASE_URL}${task.photoUrl}`}
              alt="Photo réserve"
              onClick={() =>
                onPreviewImage(`${PHOTO_BASE_URL}${task.photoUrl}`)
              }
              className="task-photo existing"
              title="Cliquer pour agrandir"
            />
          )}
        </div>
      )}
    </div>
  );
}
