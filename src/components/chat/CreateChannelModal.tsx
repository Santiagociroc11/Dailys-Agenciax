import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { ChatProjectRef } from './ChannelSidebar';

interface CreateChannelModalProps {
  open: boolean;
  /** Si se indica, el canal quedará dentro de ese proyecto (miembros = equipo del proyecto) */
  initialProjectId: string | null;
  projectsList: ChatProjectRef[];
  onClose: () => void;
  onCreate: (name: string, description: string, projectId: string | null) => Promise<void>;
}

export function CreateChannelModal({
  open,
  initialProjectId,
  projectsList,
  onClose,
  onCreate,
}: CreateChannelModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProjectId(initialProjectId || '');
  }, [open, initialProjectId]);

  if (!open) return null;

  const submit = async () => {
    const n = name.trim();
    if (!n || saving) return;
    setSaving(true);
    try {
      const pid = projectId.trim() || null;
      await onCreate(n, description.trim(), pid);
      setName('');
      setDescription('');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 relative">
        <button
          type="button"
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          onClick={onClose}
          aria-label="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Nuevo canal</h2>
        <p className="text-sm text-gray-500 mb-4">
          Elige un proyecto para que el canal aparezca ahí y lo vean las mismas personas asignadas al proyecto
          (y los administradores). Si lo dejas en “Ninguno”, será un canal global.
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Proyecto</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">Ninguno (canal global)</option>
              {projectsList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej. diseño, revisiones"
              maxLength={80}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción (opcional)</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[72px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Para qué sirve este canal"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={!name.trim() || saving}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            onClick={submit}
          >
            {saving ? 'Creando…' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  );
}
