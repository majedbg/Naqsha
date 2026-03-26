import { useState, useCallback } from 'react';

const STORAGE_KEY = 'sonoform-layer-groups';

function loadGroups() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveGroups(groups) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
  } catch { /* storage full */ }
}

export default function useLayerGroups() {
  const [groups, setGroups] = useState(loadGroups);

  const saveGroup = useCallback((name, layers, canvasW, canvasH, thumbnail) => {
    const group = {
      id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      layers: JSON.parse(JSON.stringify(layers)), // deep clone
      canvasW,
      canvasH,
      thumbnail,
      timestamp: Date.now(),
    };
    setGroups((prev) => {
      const next = [group, ...prev];
      saveGroups(next);
      return next;
    });
    return group;
  }, []);

  const deleteGroup = useCallback((id) => {
    setGroups((prev) => {
      const next = prev.filter((g) => g.id !== id);
      saveGroups(next);
      return next;
    });
  }, []);

  const renameGroup = useCallback((id, name) => {
    setGroups((prev) => {
      const next = prev.map((g) => (g.id === id ? { ...g, name } : g));
      saveGroups(next);
      return next;
    });
  }, []);

  return { groups, saveGroup, deleteGroup, renameGroup };
}
