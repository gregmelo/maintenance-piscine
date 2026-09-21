import { X } from "lucide-react";

const API_BASE_URL = "https://vericelgregory.alwaysdata.net/piscine";
const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

export default function TaskHistoryModal({ task, history, loading, onClose, onPreviewImage, formatDate }) {
  if (!task) return null;

  return (
    <div className="history-modal" onClick={onClose}>
      <div className="history-modal__card" onClick={(event) => event.stopPropagation()}>
        <div className="history-modal__header">
          <div><h3>Historique des contrôles</h3><span>{task.title}</span></div>
          <button onClick={onClose} title="Fermer"><X size={20} /></button>
        </div>
        <div className="history-modal__body">
          {loading ? <p>Chargement de l'historique...</p> : history.length === 0 ? (
            <p className="history-modal__empty">Aucun historique enregistré pour ce point de contrôle.</p>
          ) : (
            <div className="history-list">
              {history.map((entry) => {
                const statusClass = entry.status === "FAIT" ? "done" : entry.status === "RESERVE" ? "reserved" : "todo";
                return (
                  <div className={`history-entry ${statusClass}`} key={entry.logId}>
                    <div className="history-entry__heading">
                      <span>{MONTH_NAMES[entry.month - 1]} {entry.year}</span>
                      <strong>{entry.status === "FAIT" ? "FAIT" : entry.status === "RESERVE" ? "RÉSERVE" : "À FAIRE"}</strong>
                    </div>
                    {entry.updatedBy && <div className="history-entry__meta">Par {entry.updatedBy} {entry.completedAt && formatDate(entry.completedAt)}</div>}
                    {entry.observation && <div className="history-entry__note">« {entry.observation} »</div>}
                    {entry.photoUrl && <img className="history-entry__photo" src={`${API_BASE_URL}${entry.photoUrl}`} alt="Photo contrôle" onClick={() => onPreviewImage(`${API_BASE_URL}${entry.photoUrl}`)} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}