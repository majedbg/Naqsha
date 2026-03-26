import { useState } from 'react';
import { PATTERN_TYPES } from '../constants';

const patternLabel = (id) => PATTERN_TYPES.find((p) => p.id === id)?.label || id;

export default function LayerGroupModal({ groups, onLoad, onDelete, onRename, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center pt-16 px-4" onClick={onClose}>
      <div
        className="bg-panel border border-card-border rounded-lg w-full max-w-[720px] max-h-[75vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#333] shrink-0">
          <h2 className="text-sm font-semibold text-gray-200">Saved Layer Groups</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none px-1"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-4">
          {groups.length === 0 ? (
            <p className="text-center text-gray-600 text-sm py-12">
              No saved layer groups yet. Use "Save Layer Group" to save your current work.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {groups.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  onLoad={() => { onLoad(group); onClose(); }}
                  onDelete={() => onDelete(group.id)}
                  onRename={(name) => onRename(group.id, name)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GroupCard({ group, onLoad, onDelete, onRename }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleRename = () => {
    const trimmed = name.trim() || 'Untitled';
    if (trimmed !== group.name) onRename(trimmed);
    setName(trimmed);
    setEditing(false);
  };

  return (
    <div className="bg-card border border-card-border rounded-lg overflow-hidden hover:border-accent/50 transition-colors group">
      {/* Thumbnail */}
      <div
        className="aspect-square bg-white cursor-pointer relative overflow-hidden"
        onClick={onLoad}
      >
        {group.thumbnail ? (
          <img
            src={group.thumbnail}
            alt={group.name}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
            No preview
          </div>
        )}
        <div className="absolute inset-0 bg-accent/0 group-hover:bg-accent/10 transition-colors flex items-center justify-center">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-accent text-xs font-medium bg-black/60 px-2 py-1 rounded">
            Load
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="px-2.5 py-2 space-y-1.5">
        {/* Name + date */}
        {editing ? (
          <input
            className="bg-[#333] text-gray-200 text-xs px-1 py-0.5 rounded border border-accent outline-none w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            autoFocus
          />
        ) : (
          <p className="text-xs font-medium truncate" title={group.name}>
            {group.name === 'Untitled' ? (
              <span className="text-gray-500 italic">Untitled</span>
            ) : (
              <span className="text-gray-200">{group.name}</span>
            )}
          </p>
        )}
        <span className="text-[10px] text-gray-600">
          {new Date(group.timestamp).toLocaleString()}
        </span>

        {/* Layer list */}
        <div className="space-y-0.5">
          {group.layers.map((layer) => (
            <div key={layer.id} className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: layer.color }}
              />
              <span
                className="text-[10px] truncate"
                style={{ color: layer.color }}
              >
                {patternLabel(layer.patternType)}
              </span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="relative pt-0.5">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); setName(group.name); setEditing(true); }}
              className="text-[10px] text-gray-600 hover:text-accent transition-colors"
            >
              Rename
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
              className="text-[10px] text-gray-600 hover:text-red-400 transition-colors"
            >
              Delete
            </button>
          </div>
          {confirmDelete && (
            <div className="absolute bottom-6 right-0 bg-[#2a2a2a] border border-[#444] rounded-lg shadow-xl p-2.5 z-10 w-40">
              <p className="text-[11px] text-gray-300 mb-2">Delete this group?</p>
              <div className="flex gap-1.5">
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  className="flex-1 text-[10px] py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                  className="flex-1 text-[10px] py-1 rounded bg-[#333] text-gray-400 hover:bg-[#3a3a3a] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
