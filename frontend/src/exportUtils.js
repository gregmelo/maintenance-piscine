/**
 * Exporte un tableau de tâches au format CSV UTF-8
 */
export function exportTasksToCSV(tasks, monthName, year) {
  if (!tasks || tasks.length === 0) {
    alert("Aucune tâche à exporter.");
    return;
  }

  const headers = [
    "Catégorie",
    "Point de contrôle",
    "Périodicité",
    "Statut",
    "Opérateur",
    "Date de réalisation",
    "Observations / Réserve",
  ];

  const rows = tasks.map((t) => {
    let dateStr = "";
    if (t.completedAt) {
      try {
        const d = new Date(t.completedAt);
        dateStr = d.toLocaleString("fr-FR");
      } catch {
        dateStr = t.completedAt;
      }
    }

    const statutLabel =
      t.status === "FAIT"
        ? "FAIT"
        : t.status === "RESERVE"
        ? "RESERVE"
        : "A FAIRE";

    return [
      `"${(t.category || "").replace(/"/g, '""')}"`,
      `"${(t.title || "").replace(/"/g, '""')}"`,
      `"${(t.frequency || "").replace(/"/g, '""')}"`,
      `"${statutLabel}"`,
      `"${(t.updatedBy || "").replace(/"/g, '""')}"`,
      `"${dateStr}"`,
      `"${(t.observation || "").replace(/"/g, '""')}"`,
    ].join(";");
  });

  // Ajout du BOM UTF-8 (\uFEFF) pour qu'Excel ouvre le fichier avec les bons accents
  const csvContent = "\uFEFF" + [headers.join(";"), ...rows].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    `registre_maintenance_${monthName.toLowerCase()}_${year}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}