import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

/**
 * Génère et télécharge un PDF conforme pour les commissions de sécurité
 */
export function exportTasksToPDF(tasks, monthName, year) {
  if (!tasks || tasks.length === 0) {
    alert("Aucune tâche à exporter.");
    return;
  }

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  // Titre & En-tête
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text("Piscine Municipale d'Ambérieu", 14, 16);

  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  doc.text(`Registre de maintenance préventive — ${monthName} ${year}`, 14, 23);

  // Préparation des données du tableau
  const tableData = tasks.map((t) => {
    let dateStr = "—";
    if (t.completedAt) {
      try {
        const d = new Date(t.completedAt);
        dateStr = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
      } catch {
        dateStr = "";
      }
    }

    const statut =
      t.status === "FAIT"
        ? "FAIT"
        : t.status === "RESERVE"
        ? "RÉSERVE"
        : "À FAIRE";

    const details = [
      t.updatedBy ? `Par: ${t.updatedBy} (${dateStr})` : "",
      t.observation ? `Note: ${t.observation}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    return [t.category || "—", t.title, t.frequency, statut, details || "—"];
  });

  // Tableau stylisé
  autoTable(doc, {
    startY: 28,
    head: [["Catégorie", "Point de contrôle", "Fréq.", "Statut", "Suivi / Observation"]],
    body: tableData,
    theme: "striped",
    headStyles: {
      fillColor: [2, 132, 199],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
    },
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      valign: "middle",
      overflow: "linebreak",
    },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 60 },
      2: { cellWidth: 20 },
      3: { cellWidth: 20 },
      4: { cellWidth: 58 },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 3) {
        if (data.cell.raw === "FAIT") {
          data.cell.styles.textColor = [22, 163, 74];
          data.cell.styles.fontStyle = "bold";
        } else if (data.cell.raw === "RÉSERVE") {
          data.cell.styles.textColor = [217, 119, 6];
          data.cell.styles.fontStyle = "bold";
        } else {
          data.cell.styles.textColor = [239, 68, 68];
        }
      }
    },
  });

  // Bloc émargement en pied de page
  const finalY = doc.lastAutoTable.finalY + 12;
  const pageHeight = doc.internal.pageSize.height;

  // Si on est trop bas sur la page, on ajoute une page pour la signature
  if (finalY > pageHeight - 30) {
    doc.addPage();
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text("Visa & Émargement de contrôle :", 14, 20);
    doc.text("Signature du technicien : ___________________", 14, 35);
    doc.text("Visa de la direction : ___________________", 110, 35);
  } else {
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text("Visa & Émargement de contrôle :", 14, finalY);
    doc.text("Signature du technicien : ___________________", 14, finalY + 15);
    doc.text("Visa de la direction : ___________________", 110, finalY + 15);
  }

  doc.save(`registre_maintenance_${monthName.toLowerCase()}_${year}.pdf`);
}

/**
 * Génère le registre annuel complet de l'année au format PDF
 */
export function exportAnnualPDF(summaryData, year) {
  if (!summaryData || summaryData.length === 0) {
    alert("Aucune donnée annuelle à exporter.");
    return;
  }

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  // Page de garde / En-tête
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text("Piscine Municipale d'Ambérieu", 14, 20);

  doc.setFontSize(12);
  doc.setTextColor(71, 85, 105);
  doc.text(`Carnet sanitaire et registre annuel de maintenance — Année ${year}`, 14, 28);

  const monthsNames = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
  ];

  const tableData = summaryData.map((m) => [
    monthsNames[m.month - 1],
    m.dueCount,
    m.doneCount,
    m.reserveCount,
    m.todoCount,
    `${m.rate}%`,
  ]);

  autoTable(doc, {
    startY: 36,
    head: [["Mois", "Contrôles dus", "Faites", "Réserves", "Non traitées", "Taux de réalisation"]],
    body: tableData,
    theme: "striped",
    headStyles: {
      fillColor: [2, 132, 199],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
    },
    styles: { fontSize: 8.5, cellPadding: 3, halign: "center" },
    columnStyles: { 0: { halign: "left", fontStyle: "bold" } },
  });

  const finalY = doc.lastAutoTable.finalY + 15;
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text("Visa de clôture annuelle de l'établissement :", 14, finalY);
  doc.text("Le Responsable Technique : ___________________", 14, finalY + 15);
  doc.text("La Direction : ___________________", 110, finalY + 15);

  doc.save(`registre_annuel_maintenance_${year}.pdf`);
}