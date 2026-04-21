import { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useGate } from '../lib/useGate';
import { loadUserDesigns, deleteDesign } from '../lib/designService';
import { loadCollections, createCollection, deleteCollection, loadCollectionDesigns } from '../lib/collectionService';
import { supabase } from '../lib/supabase';

export default function CloudSaveModal({ onLoad, onLoadConfig, onClose }) {
  const { user } = useAuth();
  const { limits } = useGate();
  const [tab, setTab] = useState('designs'); // 'designs' | 'collections'
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [historyDesignId, setHistoryDesignId] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  // Collections (Pro)
  const [collections, setCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [collectionDesigns, setCollectionDesigns] = useState([]);
  const [newCollectionName, setNewCollectionName] = useState('');

  const hasCollections = limits.collections;

  useEffect(() => {
    if (!user) return;
    loadUserDesigns(user.id)
      .then(setDesigns)
      .catch(console.error)
      .finally(() => setLoading(false));
    if (hasCollections) {
      loadCollections(user.id).then(setCollections).catch(console.error);
    }
  }, [user, hasCollections]);

  const handleDelete = async (id) => {
    try {
      await deleteDesign(id, user.id);
      setDesigns((prev) => prev.filter((d) => d.id !== id));
      setConfirmDeleteId(null);
      if (historyDesignId === id) setHistoryDesignId(null);
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  const toggleHistory = async (designId) => {
    if (historyDesignId === designId) {
      setHistoryDesignId(null);
      return;
    }
    setHistoryDesignId(designId);
    setHistoryLoading(true);
    try {
      if (!supabase) return;
      const { data } = await supabase
        .from('design_history')
        .select('id, thumbnail, created_at')
        .eq('design_id', designId)
        .order('created_at', { ascending: false })
        .limit(50);
      setHistoryItems(data || []);
    } catch (err) {
      console.error('Failed to load history:', err);
      setHistoryItems([]);
    }
    setHistoryLoading(false);
  };

  const loadHistorySnapshot = async (snapshotId) => {
    if (!supabase || !onLoadConfig) return;
    try {
      const { data } = await supabase
        .from('design_history')
        .select('config')
        .eq('id', snapshotId)
        .single();
      if (data?.config) {
        onLoadConfig(data.config);
        onClose();
      }
    } catch (err) {
      console.error('Failed to load snapshot:', err);
    }
  };

  const hasHistory = limits.historySnapshots > 0;

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim() || !user) return;
    try {
      const col = await createCollection(user.id, newCollectionName.trim());
      if (col) setCollections((prev) => [col, ...prev]);
      setNewCollectionName('');
    } catch (err) { console.error(err); }
  };

  const handleSelectCollection = async (col) => {
    setSelectedCollection(col);
    try {
      const designs = await loadCollectionDesigns(col.id);
      setCollectionDesigns(designs);
    } catch (err) { console.error(err); setCollectionDesigns([]); }
  };

  const handleDeleteCollection = async (colId) => {
    try {
      await deleteCollection(colId);
      setCollections((prev) => prev.filter((c) => c.id !== colId));
      if (selectedCollection?.id === colId) {
        setSelectedCollection(null);
        setCollectionDesigns([]);
      }
    } catch (err) { console.error(err); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/70 flex items-start justify-center pt-16 px-4" onClick={onClose}>
      <div
        className="bg-panel border border-card-border rounded-lg w-full max-w-[720px] max-h-[75vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setTab('designs'); setSelectedCollection(null); }}
              className={`text-sm font-semibold transition-colors ${tab === 'designs' ? 'text-ink' : 'text-ink-soft hover:text-ink-soft'}`}
            >
              Designs
            </button>
            {hasCollections && (
              <button
                onClick={() => setTab('collections')}
                className={`text-sm font-semibold transition-colors ${tab === 'collections' ? 'text-ink' : 'text-ink-soft hover:text-ink-soft'}`}
              >
                Collections
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-ink-soft hover:text-ink transition-colors text-lg leading-none px-1"
          >
            &times;
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          {tab === 'collections' && hasCollections ? (
            /* Collections tab */
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-muted text-ink text-xs px-2 py-1.5 rounded border border-hairline outline-none focus:border-violet"
                  placeholder="New collection name..."
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateCollection()}
                />
                <button
                  onClick={handleCreateCollection}
                  disabled={!newCollectionName.trim()}
                  className="px-3 py-1.5 text-xs rounded bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-30 transition-colors"
                >
                  Create
                </button>
              </div>
              {selectedCollection ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setSelectedCollection(null); setCollectionDesigns([]); }} className="text-[11px] text-ink-soft hover:text-ink">&larr; Back</button>
                    <span className="text-xs font-medium text-ink">{selectedCollection.name}</span>
                  </div>
                  {collectionDesigns.length === 0 ? (
                    <p className="text-[11px] text-ink-soft py-4 text-center">No designs in this collection</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {collectionDesigns.map((d) => (
                        <div key={d.id} className="bg-card border border-card-border rounded overflow-hidden cursor-pointer hover:border-violet/50" onClick={() => { onLoad(d.id); onClose(); }}>
                          <div className="aspect-square bg-white">
                            {d.thumbnail ? <img src={d.thumbnail} alt="" className="w-full h-full object-contain" /> : <div className="w-full h-full flex items-center justify-center text-ink-soft text-[9px]">No preview</div>}
                          </div>
                          <p className="text-[10px] text-ink truncate px-1.5 py-1">{d.name}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {collections.length === 0 ? (
                    <p className="text-[11px] text-ink-soft py-8 text-center">No collections yet</p>
                  ) : collections.map((col) => (
                    <div key={col.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted transition-colors">
                      <button onClick={() => handleSelectCollection(col)} className="flex-1 text-left text-xs text-ink truncate">{col.name}</button>
                      <span className="text-[10px] text-ink-soft">{new Date(col.updated_at).toLocaleDateString()}</span>
                      <button onClick={() => handleDeleteCollection(col.id)} className="text-[10px] text-ink-soft hover:text-tone-strong transition-colors">Delete</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : loading ? (
            <p className="text-center text-ink-soft text-sm py-12">Loading...</p>
          ) : designs.length === 0 ? (
            <p className="text-center text-ink-soft text-sm py-12">
              No saved designs yet. Use "Save to Cloud" to store your work.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {designs.map((design) => (
                <div key={design.id} className="bg-card border border-card-border rounded-lg overflow-hidden hover:border-violet/50 transition-colors group">
                  {/* Thumbnail */}
                  <div className="aspect-square bg-white relative overflow-hidden cursor-pointer" onClick={() => { onLoad(design.id); onClose(); }}>
                    {design.thumbnail ? (
                      <img src={design.thumbnail} alt={design.name} className="w-full h-full object-contain" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-ink-soft text-xs">No preview</div>
                    )}
                    <div className="absolute inset-0 bg-accent/0 group-hover:bg-accent/10 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity text-accent text-xs font-medium bg-ink/60 px-2 py-1 rounded">Load</span>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="px-2.5 py-2 space-y-1">
                    <p className="text-xs font-medium text-ink truncate">{design.name}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-ink-soft">
                        {new Date(design.updated_at).toLocaleDateString()}
                      </span>
                      <div className="flex items-center gap-2">
                        {hasHistory && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleHistory(design.id); }}
                            className={`text-[10px] transition-colors ${historyDesignId === design.id ? 'text-accent' : 'text-ink-soft hover:text-ink-soft'}`}
                          >
                            History
                          </button>
                        )}
                        <div className="relative">
                          {confirmDeleteId === design.id ? (
                            <div className="flex gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(design.id); }}
                                className="text-[10px] text-tone-strong hover:text-tone-strong"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                                className="text-[10px] text-ink-soft"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(design.id); }}
                              className="text-[10px] text-ink-soft hover:text-tone-strong transition-colors"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    {design.share_token && (
                      <span className="text-[10px] text-accent">Shared</span>
                    )}

                    {/* History panel (Pro) */}
                    {historyDesignId === design.id && (
                      <div className="border-t border-hairline pt-1.5 mt-1.5">
                        {historyLoading ? (
                          <p className="text-[10px] text-ink-soft">Loading history...</p>
                        ) : historyItems.length === 0 ? (
                          <p className="text-[10px] text-ink-soft">No snapshots yet</p>
                        ) : (
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {historyItems.map((snap) => (
                              <button
                                key={snap.id}
                                onClick={(e) => { e.stopPropagation(); loadHistorySnapshot(snap.id); }}
                                className="w-full flex items-center gap-2 py-0.5 hover:bg-muted rounded px-1 transition-colors"
                              >
                                {snap.thumbnail && (
                                  <img src={snap.thumbnail} alt="" className="w-6 h-6 rounded object-contain bg-white shrink-0" />
                                )}
                                <span className="text-[10px] text-ink-soft">
                                  {new Date(snap.created_at).toLocaleString()}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
