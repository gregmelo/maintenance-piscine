import { ChevronDown, ChevronRight } from "lucide-react";
import TaskItem from "./TaskItem";

export default function CategoryList({
  groupedTasks,
  openCategories,
  onToggleCategory,
  taskProps,
}) {
  return (
    <div className="categories-grid">
      {Object.entries(groupedTasks).map(([category, items]) => {
        const isOpen = openCategories[category];
        return (
          <div key={category} className="category-card">
            <div onClick={() => onToggleCategory(category)} className="category-header">
              <span className="category-name">{category}</span>
              <div className="category-summary">
                <span className="category-count">({items.length})</span>
                {isOpen ? <ChevronDown size={18} color="#64748b" /> : <ChevronRight size={18} color="#64748b" />}
              </div>
            </div>
            {isOpen && items.map((task) => <TaskItem key={task.id} task={task} {...taskProps} />)}
          </div>
        );
      })}
    </div>
  );
}