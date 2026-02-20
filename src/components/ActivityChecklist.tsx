import React, { useState, useEffect } from 'react';
import { Check, Plus, Trash2, ListChecks, IndentIncrease, IndentDecrease } from 'lucide-react';

export interface ChecklistItem {
  id: string;
  title: string;
  checked: boolean;
  order?: number;
  parentId?: string | null;
}

interface ActivityChecklistProps {
  items: ChecklistItem[];
  onUpdate: (items: ChecklistItem[]) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  emptyMessage?: string;
}

/** Ordena items en estructura jerárquica para visualización */
function getOrderedItems(items: ChecklistItem[]): ChecklistItem[] {
  const byParent = new Map<string | null, ChecklistItem[]>();
  items.forEach((item) => {
    const pid = item.parentId ?? null;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid)!.push(item);
  });
  byParent.forEach((arr) => arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));

  const result: ChecklistItem[] = [];
  function addWithChildren(parentId: string | null) {
    const children = byParent.get(parentId) || [];
    children.forEach((child) => {
      result.push(child);
      addWithChildren(child.id);
    });
  }
  addWithChildren(null);
  return result;
}

export function ActivityChecklist({
  items,
  onUpdate,
  disabled = false,
  placeholder = 'Añadir paso o verificación...',
  emptyMessage = 'Crea tu checklist para llevar el control de esta actividad',
}: ActivityChecklistProps) {
  const [newItemTitle, setNewItemTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [localItems, setLocalItems] = useState<ChecklistItem[]>([]);

  useEffect(() => {
    const sorted = [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    setLocalItems(sorted);
  }, [items]);

  const orderedItems = getOrderedItems(localItems);
  const getDepth = (item: ChecklistItem): number => {
    if (!item.parentId) return 0;
    const parent = localItems.find((i) => i.id === item.parentId);
    return parent ? 1 + getDepth(parent) : 0;
  };

  const persist = async (updated: ChecklistItem[]) => {
    setSaving(true);
    try {
      await onUpdate(updated);
      setLocalItems(updated);
    } finally {
      setSaving(false);
    }
  };

  const reorderFlat = (items: ChecklistItem[]): ChecklistItem[] => {
    const ordered = getOrderedItems(items);
    return ordered.map((item, i) => ({ ...item, order: i }));
  };

  const handleAdd = async (parentId?: string | null) => {
    const title = newItemTitle.trim();
    if (!title || disabled) return;
    const newItem: ChecklistItem = {
      id: crypto.randomUUID(),
      title,
      checked: false,
      order: localItems.length,
      parentId: parentId ?? undefined,
    };
    const updated = reorderFlat([...localItems, newItem]);
    setNewItemTitle('');
    await persist(updated);
  };

  const handleToggle = async (id: string) => {
    if (disabled) return;
    const updated = localItems.map((item) =>
      item.id === id ? { ...item, checked: !item.checked } : item
    );
    await persist(updated);
  };

  const handleDelete = async (id: string) => {
    if (disabled) return;
    const item = localItems.find((i) => i.id === id);
    if (!item) return;
    const updated = localItems
      .filter((i) => i.id !== id)
      .map((i) => (i.parentId === id ? { ...i, parentId: item.parentId ?? undefined } : i));
    await persist(reorderFlat(updated));
  };

  const handleIndent = async (id: string) => {
    if (disabled) return;
    const idx = orderedItems.findIndex((i) => i.id === id);
    if (idx <= 0) return;
    const prev = orderedItems[idx - 1];
    const updated = localItems.map((i) =>
      i.id === id ? { ...i, parentId: prev.id } : i
    );
    await persist(reorderFlat(updated));
  };

  const handleOutdent = async (id: string) => {
    if (disabled) return;
    const item = localItems.find((i) => i.id === id);
    if (!item?.parentId) return;
    const parent = localItems.find((i) => i.id === item.parentId);
    const updated = localItems.map((i) =>
      i.id === id ? { ...i, parentId: parent?.parentId ?? undefined } : i
    );
    await persist(reorderFlat(updated));
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') handleToggle(id);
  };

  const completed = localItems.filter((i) => i.checked).length;
  const total = localItems.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/50 overflow-hidden">
      <div className="px-3 py-2 bg-white border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <ListChecks className="w-4 h-4 text-indigo-500" />
          Mi checklist
          {total > 0 && (
            <span className="text-xs font-normal text-gray-500">
              {completed}/{total} completados
            </span>
          )}
        </div>
        {total > 0 && (
          <div className="flex items-center gap-1">
            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>
      <div className="p-3 space-y-1 max-h-48 overflow-y-auto">
        {localItems.length === 0 && !newItemTitle && (
          <p className="text-sm text-gray-500 py-2 italic">{emptyMessage}</p>
        )}
        {orderedItems.map((item) => {
          const depth = getDepth(item);
          const canIndent = orderedItems.indexOf(item) > 0;
          const canOutdent = !!item.parentId;
          return (
            <div
              key={item.id}
              className={`flex items-center gap-2 group py-1.5 px-2 rounded-md hover:bg-white/80 transition-colors ${
                item.checked ? 'opacity-70' : ''
              } ${depth > 0 ? 'border-l-2 border-indigo-200/60' : ''}`}
              style={{ paddingLeft: 8 + depth * 20 }}
            >
              <button
                type="button"
                onClick={() => handleToggle(item.id)}
                onKeyDown={(e) => handleKeyDown(e, item.id)}
                disabled={disabled}
                className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                  item.checked
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'border-gray-300 hover:border-indigo-400'
                } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                aria-label={item.checked ? 'Desmarcar' : 'Marcar'}
              >
                {item.checked && <Check className="w-3 h-3" strokeWidth={3} />}
              </button>
              <span
                className={`flex-1 text-sm ${
                  item.checked ? 'line-through text-gray-500' : 'text-gray-800'
                }`}
              >
                {item.title}
              </span>
              {!disabled && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {canOutdent && (
                    <button
                      type="button"
                      onClick={() => handleOutdent(item.id)}
                      className="p-1 text-gray-400 hover:text-indigo-600 rounded transition-colors"
                      title="Promover (quitar sangría)"
                      aria-label="Promover"
                    >
                      <IndentDecrease className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {canIndent && (
                    <button
                      type="button"
                      onClick={() => handleIndent(item.id)}
                      className="p-1 text-gray-400 hover:text-indigo-600 rounded transition-colors"
                      title="Convertir en sub-item"
                      aria-label="Indentar"
                    >
                      <IndentIncrease className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {!disabled && (
          <div className="flex gap-2 pt-1">
            <input
              type="text"
              value={newItemTitle}
              onChange={(e) => setNewItemTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder={placeholder}
              className="flex-1 text-sm px-2 py-1.5 border border-gray-200 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={() => handleAdd()}
              disabled={!newItemTitle.trim() || saving}
              className="flex items-center gap-1 px-2 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-4 h-4" />
              Añadir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
