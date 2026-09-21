import Dexie from 'dexie';

// Cette base locale permet de consulter les taches et de travailler hors connexion.
export const db = new Dexie('PiscineMaintenanceDB');

db.version(1).stores({
  // tasksCache contient le dernier etat connu ; syncQueue contient les changements a rejouer.
  tasksCache: 'id, category, isDue',
  syncQueue: '++id, taskId, year, month, status, observation, updatedBy, timestamp'
});