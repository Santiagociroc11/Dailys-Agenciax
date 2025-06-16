import React from 'react';

interface RichTextSummaryProps {
  text: string;
  className?: string;
  maxLength?: number;
}

const RichTextSummary: React.FC<RichTextSummaryProps> = ({ 
  text, 
  className = '', 
  maxLength = 100 
}) => {
  if (!text || text.trim() === '') {
    return null;
  }

  // Función para asegurar que todos los enlaces tengan los estilos correctos
  const processLinks = (content: string) => {
    // Primero, detectar y convertir URLs que no estén ya dentro de enlaces
    const urlRegex = /(^|[^"'>])(https?:\/\/[^\s<>"']+)/g;
    let processedContent = content.replace(urlRegex, '$1<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 underline">$2</a>');
    
    // Luego, asegurar que todos los enlaces existentes tengan las clases correctas
    // Buscar todos los tags <a> y asegurar que tengan las clases de Tailwind
    processedContent = processedContent.replace(
      /<a([^>]*?)>/g, 
      (match, attributes) => {
        // Si ya tiene class, agregar nuestras clases
        if (attributes.includes('class=')) {
          // Reemplazar o agregar las clases de color
          attributes = attributes.replace(
            /class="([^"]*?)"/g, 
            (_classMatch: string, existingClasses: string) => {
              // Remover clases de color existentes y agregar las nuestras
              const cleanClasses = existingClasses
                .replace(/text-blue-\d+/g, '')
                .replace(/hover:text-blue-\d+/g, '')
                .replace(/underline/g, '')
                .trim();
              const newClasses = cleanClasses 
                ? `${cleanClasses} text-blue-600 hover:text-blue-800 underline`
                : 'text-blue-600 hover:text-blue-800 underline';
              return `class="${newClasses}"`;
            }
          );
        } else {
          // Si no tiene class, agregarla
          attributes += ' class="text-blue-600 hover:text-blue-800 underline"';
        }
        
        // Asegurar que tenga target="_blank" y rel
        if (!attributes.includes('target=')) {
          attributes += ' target="_blank"';
        }
        if (!attributes.includes('rel=')) {
          attributes += ' rel="noopener noreferrer"';
        }
        
        return `<a${attributes}>`;
      }
    );
    
    return processedContent;
  };

  // Extraer solo el texto plano del HTML
  const getPlainText = (html: string) => {
    // Crear un elemento temporal para extraer el texto
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || '';
  };

  const plainText = getPlainText(text);
  
  // Si el texto es corto, mostrarlo completo con procesamiento de enlaces
  if (plainText.length <= maxLength) {
    const processedText = processLinks(text);
    return (
      <div 
        className={`${className} text-gray-600`}
        dangerouslySetInnerHTML={{ __html: processedText }}
        style={{ wordBreak: 'break-word' }}
      />
    );
  }

  // Si es largo, mostrar resumen con procesamiento de enlaces
  const summary = plainText.substring(0, maxLength).trim() + '...';
  const processedSummary = processLinks(summary);
  
  return (
    <div 
      className={`${className} text-gray-600`}
      dangerouslySetInnerHTML={{ __html: processedSummary }}
      style={{ wordBreak: 'break-word' }}
    />
  );
};

export default RichTextSummary; 