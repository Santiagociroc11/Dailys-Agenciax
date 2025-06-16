import React, { useState } from 'react';
import { Info, X } from 'lucide-react';
import { getFullVersionInfo } from '../lib/version';

export default function VersionInfo() {
  const [showModal, setShowModal] = useState(false);
  const versionInfo = getFullVersionInfo();

  return (
    <>
      <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center hover:text-gray-700 transition-colors"
          title="Ver información de versión"
        >
          <Info className="w-3 h-3 mr-1" />
          {versionInfo.displayVersion}
        </button>
        <span>{versionInfo.buildDate}</span>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-md">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-semibold">Información de Versión</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6">
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium text-gray-900 mb-1">Versión Actual</h3>
                  <p className="text-2xl font-bold text-indigo-600">{versionInfo.displayVersion}</p>
                </div>
                
                <div>
                  <h3 className="font-medium text-gray-900 mb-1">Fecha de Compilación</h3>
                  <p className="text-gray-600">{versionInfo.buildDate}</p>
                </div>
                
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Notas de la Versión</h3>
                  <ul className="space-y-1">
                    {versionInfo.releaseNotes.map((note, index) => (
                      <li key={index} className="text-sm text-gray-600 flex items-start">
                        <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full mr-2 mt-2 flex-shrink-0"></span>
                        {note}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end p-6 border-t">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 