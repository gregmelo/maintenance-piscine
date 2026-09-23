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
  const hasNote = Boolean(task.observation && task.observation.trim().length > 0);
  const photo = photos[task.id] || task.photoUrl;
  const photoUrl = photos[task.id] || `${PHOTO_BASE_URL}${task.photoUrl}`;

  // Détection automatique du calque approprié selon l'intitulé ou la catégorie
  const titleLower = (task.title || "").toLowerCase();
  const catLower = (task.category || "").toLowerCase();

  const isMappable =
    catLower.includes("incendie") ||
    catLower.includes("sécurité") ||
    catLower.includes("electricite") ||
    catLower.includes("éclairage") ||
    titleLower.includes("extincteur") ||
    titleLower.includes("baes") ||
    titleLower.includes("désenfumage") ||
    titleLower.includes("desenfumage") ||
    titleLower.includes("gaz") ||
    titleLower.includes("coupure") ||
    titleLower.includes("tgbt");

  const handleOpenPlanForTask = (e) => {
    e.stopPropagation();
    if (!onOpenPlan) return;

    let targetLayer = "all";
    if (titleLower.includes("extincteur")) {
      targetLayer = "extincteur";
    } else if (titleLower.includes("baes") || titleLower.includes("secours")) {
      targetLayer = "baes";
    } else if (titleLower.includes("désenfumage") || titleLower.includes("desenfumage")) {
      targetLayer = "desenfumage";
    } else if (
      titleLower.includes("coupure") ||
      titleLower.includes("gaz") ||
      titleLower.includes("armoire") ||
      titleLower.includes("tgbt")
    ) {
      targetLayer = "coupure";
    }

    onOpenPlan(targetLayer);
  };

  return (
    <div className={`task-row ${isDue ? "" : "is-not-due"}`}>
      <div className="task-main">
        <div className="task-details">
          <div className="task-heading">
            <span className="task-title">{task.title}</span>

            <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              {/* Bouton vers le Plan interactif pré-filtré */}
              {isMappable && onOpenPlan && (
                <button
                  type="button"
                  onClick={handleOpenPlanForTask}
                  className="history-trigger no-print"
                  style={{ color: "#d97706" }}
                  title="Localiser cet équipement sur le plan"
                >
                  <Map size={14} />
                </button>
              )}

              {/* Bouton d'historique */}
              <button
                type="button"
                onClick={() => onOpenHistory(task)}
                className="history-trigger no-print"
                title="Consulter l'historique de cette tâche"
              >
                <History size={14} />
              </button>
            </div>
          </div>

          <div className="task-meta">
            <span>{task.frequency}</span>
            {!isDue && <span className="not-due-label">• Non dû ce mois</span>}
            {task.status !== "A_FAIRE" && task.updatedBy && (
              <span className="validated-by">
                • Validé par <strong>{task.updatedBy}</strong>
                {task.completedAt && (
                  <span className="completed-at"> {formatCompletedAt(task.completedAt)}</span>
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
            <MessageSquare size={14} /> Préciser l'anomalie / réserve constatée :
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
                onChange={(event) => onPhotoChange(task.id, event.target.files[0])}
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
            <button onClick={() => onSaveNote(task)} className="save-note-button">
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
              onClick={() => onPreviewImage(`${PHOTO_BASE_URL}${task.photoUrl}`)}
              className="task-photo existing"
              title="Cliquer pour agrandir"
            />
          )}
        </div>
      )}
    </div>
  );
}