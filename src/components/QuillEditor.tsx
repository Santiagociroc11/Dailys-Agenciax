import React, { useMemo, useRef, useEffect } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

interface QuillEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minHeight?: string;
}

const QuillEditor: React.FC<QuillEditorProps> = ({
  value,
  onChange,
  placeholder = 'Escribe aquí...',
  disabled = false,
  className = '',
  minHeight = '120px'
}) => {
  const quillRef = useRef<ReactQuill>(null);

  // Configuración de la toolbar
  const modules = useMemo(() => ({
    toolbar: [
      ['bold', 'italic', 'underline'],
      ['link'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      ['clean']
    ]
  }), []);

  // Formatos permitidos
  const formats = [
    'bold', 'italic', 'underline',
    'link',
    'list', 'bullet'
  ];

  // Función para detectar y convertir URLs automáticamente
  const detectAndLinkifyURLs = (content: string) => {
    // Solo procesar si no hay enlaces ya presentes en esa URL
    const urlRegex = /(^|[^"'>=])(https?:\/\/[^\s<>"']+)/g;
    
    return content.replace(urlRegex, (match, prefix, url) => {
      // Verificar si la URL ya está dentro de un enlace
      const beforeMatch = content.substring(0, content.indexOf(match));
      const afterMatch = content.substring(content.indexOf(match) + match.length);
      
      // Si ya está dentro de un tag <a>, no convertir
      if (beforeMatch.lastIndexOf('<a') > beforeMatch.lastIndexOf('</a>') ||
          afterMatch.indexOf('</a>') < afterMatch.indexOf('<a')) {
        return match;
      }
      
      return `${prefix}<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline;">${url}</a>`;
    });
  };

  // Manejar cambios
  const handleChange = (content: string) => {
    // Si el contenido está vacío (solo tags vacíos), guardar string vacío
    const textContent = content.replace(/<[^>]*>/g, '').trim();
    if (!textContent) {
      onChange('');
      return;
    }
    
    // Detectar y convertir URLs automáticamente
    const processedContent = detectAndLinkifyURLs(content);
    
    // Guardar el contenido HTML procesado
    onChange(processedContent);
  };

  // Función para convertir URLs manualmente
  const convertURLsManually = () => {
    if (quillRef.current) {
      const quill = quillRef.current.getEditor();
      const content = quill.root.innerHTML;
      const processedContent = detectAndLinkifyURLs(content);
      
      if (processedContent !== content) {
        quill.root.innerHTML = processedContent;
        onChange(processedContent);
      }
    }
  };

  return (
    <div className={`${className}`}>
      <style>{`
        .ql-editor {
          min-height: ${minHeight} !important;
          font-family: inherit;
          font-size: 14px;
          line-height: 1.5;
        }
        
        .ql-toolbar {
          border-top: 1px solid #d1d5db;
          border-left: 1px solid #d1d5db;
          border-right: 1px solid #d1d5db;
          border-bottom: none;
          background: #f9fafb;
        }
        
        .ql-container {
          border-bottom: 1px solid #d1d5db;
          border-left: 1px solid #d1d5db;
          border-right: 1px solid #d1d5db;
          border-top: none;
          font-family: inherit;
        }
        
        .ql-editor.ql-blank::before {
          color: #9ca3af;
          font-style: normal;
        }
        
        /* Estilos para focus */
        .ql-container.ql-snow {
          border-color: #d1d5db;
        }
        
        .quill-focused .ql-toolbar {
          border-color: #6366f1;
        }
        
        .quill-focused .ql-container {
          border-color: #6366f1;
          box-shadow: 0 0 0 1px #6366f1;
        }
        
        /* Estilos para disabled */
        .ql-toolbar.ql-disabled {
          background: #f3f4f6;
          opacity: 0.6;
        }
        
        .ql-editor.ql-disabled {
          background: #f9fafb;
          color: #6b7280;
        }

        /* Estilos para enlaces */
        .ql-editor a {
          color: #2563eb !important;
          text-decoration: underline !important;
        }
        
        .ql-editor a:hover {
          color: #1d4ed8 !important;
          text-decoration: underline !important;
        }
      `}</style>
      
      <div className={disabled ? '' : 'quill-focused'}>
        <ReactQuill
          ref={quillRef}
          theme="snow"
          value={value || ''}
          onChange={handleChange}
          placeholder={placeholder}
          readOnly={disabled}
          modules={modules}
          formats={formats}
          style={{
            backgroundColor: disabled ? '#f9fafb' : 'white'
          }}
        />
      </div>
      
      {/* Botón para convertir URLs manualmente */}
      <div className="mt-2 flex justify-between items-center">
        <button
          type="button"
          onClick={convertURLsManually}
          className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 transition-colors"
        >
          🔗 Convertir URLs a enlaces
        </button>
        
        {/* Contador de caracteres */}
        <div className="text-xs text-gray-500">
          {value ? value.replace(/<[^>]*>/g, '').length : 0} caracteres
        </div>
      </div>
      
      {/* Ayuda */}
      <div className="mt-1 text-xs text-gray-500">
        💡 Tip: Pega URLs y haz clic en "Convertir URLs a enlaces" o usa el botón de enlace en la toolbar
      </div>
    </div>
  );
};

export default QuillEditor; 