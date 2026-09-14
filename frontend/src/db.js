import Dexie from 'dexie';

export const db = new Dexie('PiscineMaintenanceDB');

db.version(1).stores({
  tasksCache: 'id, category, isDue',
  syncQueue: '++id, taskId, year, month, status, observation, updatedBy, timestamp'
});