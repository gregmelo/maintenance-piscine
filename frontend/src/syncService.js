import { db } from './db';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api';

export function getApiKey() {
  return localStorage.getItem('pool_api_key') || import.meta.env.VITE_API_KEY || '';
}

export function setApiKey(key) {
  localStorage.setItem('pool_api_key', key);
}

export async function fetchTasks(year, month) {
  const apiKey = getApiKey();
  try {
    const res = await fetch(`${API_BASE_URL}/tasks?year=${year}&month=${month}`, {
      headers: {
        'X-API-KEY': apiKey,
      },
    });

    if (res.status === 401) {
      return { data: [], online: true, authError: true };
    }

    if (res.ok) {
      const data = await res.json();
      await db.tasksCache.clear();
      await db.tasksCache.bulkPut(data);
      return { data, online: true, authError: false };
    }
  } catch (err) {
    console.warn("Réseau indisponible, chargement depuis le cache local :", err);
  }

  // En cas de panne ou hors-ligne, on lit la base IndexedDB locale
  const localData = await db.tasksCache.toArray();
  return { data: localData, online: false, authError: false };
}

export async function updateTaskStatus(taskId, year, month, status, observation, user, completedAt = null) {
  const item = await db.tasksCache.get(taskId);
  if (item) {
    item.status = status;
    item.observation = observation;
    item.updatedBy = user;
    item.completedAt = completedAt;
    await db.tasksCache.put(item);
  }

  await db.syncQueue.add({
    taskId,
    year,
    month,
    status,
    observation: observation || '',
    updatedBy: user,
    completedAt: completedAt,
    timestamp: Date.now()
  });

  // On attend que la synchro parte vers le serveur
  await triggerSync();
}

export async function triggerSync() {
  if (!navigator.onLine) return;

  const apiKey = getApiKey();
  const pending = await db.syncQueue.toArray();
  if (pending.length === 0) return;

  try {
    const res = await fetch(`${API_BASE_URL}/tasks/sync`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify(pending)
    });

    if (res.ok) {
      await db.syncQueue.clear();
      console.log('Synchronisation auto réussie en base distante !');
    } else {
      console.error('Erreur retour API sync :', res.status, await res.text());
    }
  } catch (e) {
    console.warn('Échec de synchro automatique :', e);
  }
}

window.addEventListener('online', triggerSync);