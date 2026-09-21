import { BarChart3, KeyRound } from "lucide-react";

export default function AdminTabs({ activeTab, reserveCount, taskCount, onChange }) {
  const tabs = [
    { id: "summary", label: "Synthèse annuelle", icon: <BarChart3 size={16} /> },
    { id: "reserves", label: `Réserves en cours (${reserveCount})` },
    { id: "tasks", label: `Gestion des tâches (${taskCount})` },
    { id: "security", label: "Sécurité & Système", icon: <KeyRound size={16} /> },
  ];

  return (
    <nav className="admin-tabs" aria-label="Administration">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={activeTab === tab.id ? "is-active" : ""}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </nav>
  );
}