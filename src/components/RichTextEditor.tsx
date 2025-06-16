import React, { useState, useRef } from 'react';
import { Bold, Italic, Code, Link, Eye, EyeOff, Type } from 'lucide-react';
import RichTextDisplay from './RichTextDisplay';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  className?: string;
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = 'Escribe tu texto aquí...',
  rows = 3,
  disabled = false,
  className = ''
}) => {
  const [showSideBySide, setShowSideBySide] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Función para insertar texto en la posición del cursor
  const insertTextAtCursor = (before: string, after: string = '', placeholder: string = '') => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    
    // Si hay texto seleccionado, lo envolvemos
    // Si no hay texto seleccionado, insertamos el placeholder
    const textToWrap = selectedText || placeholder;
    const newText = before + textToWrap + after;
    
    const newValue = 
      textarea.value.substring(0, start) + 
      newText + 
      textarea.value.substring(end);
    
    onChange(newValue);
    
    // Restaurar el foco y posición del cursor
    setTimeout(() => {
      textarea.focus();
      if (selectedText) {
        // Si había texto seleccionado, seleccionar el texto formateado
        textarea.setSelectionRange(start, start + newText.length);
      } else {
        // Si no había texto, posicionar cursor entre las marcas
        const cursorPos = start + before.length + textToWrap.length;
        textarea.setSelectionRange(cursorPos, cursorPos);
      }
    }, 0);
  };

  // Función para insertar enlace
  const insertLink = () => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    
    const url = prompt('Ingresa la URL:', 'https://');
    if (!url) return;
    
    const linkText = selectedText || 'enlace';
    const newText = `[${linkText}](${url})`;
    
    const newValue = 
      textarea.value.substring(0, start) + 
      newText + 
      textarea.value.substring(end);
    
    onChange(newValue);
    
    setTimeout(() => {
      textarea.focus();
      const cursorPos = start + newText.length;
      textarea.setSelectionRange(cursorPos, cursorPos);
    }, 0);
  };

  const toolbarButtons = [
    {
      icon: Bold,
      title: 'Negrita',
      action: () => insertTextAtCursor('**', '**', 'texto en negrita'),
      shortcut: 'Ctrl+B'
    },
    {
      icon: Italic,
      title: 'Cursiva',
      action: () => insertTextAtCursor('*', '*', 'texto en cursiva'),
      shortcut: 'Ctrl+I'
    },
    {
      icon: Code,
      title: 'Código',
      action: () => insertTextAtCursor('`', '`', 'código'),
      shortcut: 'Ctrl+`'
    },
    {
      icon: Link,
      title: 'Insertar enlace',
      action: insertLink,
      shortcut: 'Ctrl+K'
    }
  ];

  // Manejar atajos de teclado
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 'b':
          e.preventDefault();
          insertTextAtCursor('**', '**', 'texto en negrita');
          break;
        case 'i':
          e.preventDefault();
          insertTextAtCursor('*', '*', 'texto en cursiva');
          break;
        case '`':
          e.preventDefault();
          insertTextAtCursor('`', '`', 'código');
          break;
        case 'k':
          e.preventDefault();
          insertLink();
          break;
      }
    }
  };

  return (
    <div className={`border border-gray-300 rounded-md focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 ${className}`}>
      {/* Toolbar */}
      <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 flex items-center justify-between">
        <div className="flex items-center space-x-1">
          {toolbarButtons.map((button, index) => (
            <button
              key={index}
              type="button"
              onClick={button.action}
              disabled={disabled}
              className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={`${button.title} (${button.shortcut})`}
            >
              <button.icon className="w-4 h-4" />
            </button>
          ))}
          
          <div className="w-px h-6 bg-gray-300 mx-2" />
          
          <button
            type="button"
            onClick={() => setShowSideBySide(!showSideBySide)}
            disabled={disabled}
            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={showSideBySide ? 'Vista simple' : 'Vista lado a lado'}
          >
            {showSideBySide ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        
        <div className="text-xs text-gray-500">
          {value.length} caracteres
        </div>
      </div>

      {/* Editor/Preview */}
      <div className="relative">
        {showSideBySide ? (
          <div className="grid grid-cols-2 gap-2">
            {/* Editor */}
            <div className="border-r border-gray-200">
              <div className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 border-b border-gray-200">
                Editor
              </div>
              <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                rows={rows}
                disabled={disabled}
                className="w-full p-3 border-0 focus:outline-none bg-white text-gray-900 placeholder-gray-500"
                style={{ 
                  minHeight: `${Math.max(rows * 1.5, 3)}rem`,
                  resize: 'vertical',
                  maxHeight: '400px'
                }}
              />
            </div>
            {/* Preview */}
            <div>
              <div className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 border-b border-gray-200">
                Vista previa
              </div>
              <div className="p-3 bg-white overflow-auto" style={{ 
                minHeight: `${Math.max(rows * 1.5, 3)}rem`,
                maxHeight: '400px'
              }}>
                <RichTextDisplay text={value} className="text-gray-900" />
              </div>
            </div>
          </div>
        ) : (
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={rows}
              disabled={disabled}
              className="w-full p-3 border-0 focus:outline-none bg-white text-gray-900 placeholder-gray-500"
              style={{ 
                minHeight: `${Math.max(rows * 1.5, 3)}rem`,
                resize: 'vertical',
                maxHeight: '400px'
              }}
            />
            {/* Preview overlay que aparece al escribir */}
            {value.trim() && (
              <div className="absolute top-2 right-2 z-10">
                <div className="bg-white border border-gray-300 rounded-lg shadow-lg p-2 max-w-xs">
                  <div className="text-xs font-medium text-gray-600 mb-1">Vista previa:</div>
                  <div className="text-sm max-h-20 overflow-auto">
                    <RichTextDisplay text={value} className="text-gray-700" />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Help text */}
      <div className="border-t border-gray-200 bg-gray-50 px-3 py-2">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          <span>💡 <strong>Atajos:</strong></span>
          <span><kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Ctrl+B</kbd> Negrita</span>
          <span><kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Ctrl+I</kbd> Cursiva</span>
          <span><kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Ctrl+`</kbd> Código</span>
          <span><kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Ctrl+K</kbd> Enlace</span>
        </div>
      </div>
    </div>
  );
};

export default RichTextEditor; 