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
    processedContent = processedContent.replace(
      /<a([^>]*?)>/g, 
      (match, attributes) => {
        // Si ya tiene class, agregar nuestras clases
        if (attributes.includes('class=')) {
          attributes = attributes.replace(
            /class="([^"]*?)"/g, 
            (_classMatch: string, existingClasses: string) => {
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
          attributes += ' class="text-blue-600 hover:text-blue-800 underline"';
        }
        
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

  // Extraer solo el texto plano del HTML para verificar la longitud
  const getPlainText = (html: string) => {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || '';
  };

  // Función para truncar HTML manteniendo las etiquetas
  const truncateHtml = (html: string, maxLength: number) => {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    
    const textContent = temp.textContent || temp.innerText || '';
    
    // Si el texto no necesita truncado, devolver el HTML original
    if (textContent.length <= maxLength) {
      return html;
    }

    // Función recursiva para truncar manteniendo las etiquetas
    const truncateNode = (node: Node, currentLength: number): { html: string; length: number; truncated: boolean } => {
      if (currentLength >= maxLength) {
        return { html: '', length: currentLength, truncated: true };
      }

      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        const remainingLength = maxLength - currentLength;
        
        if (text.length <= remainingLength) {
          return { html: text, length: currentLength + text.length, truncated: false };
        } else {
          const truncatedText = text.substring(0, remainingLength).trim();
          return { html: truncatedText, length: currentLength + truncatedText.length, truncated: true };
        }
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        const tagName = element.tagName.toLowerCase();
        let html = `<${tagName}`;
        
        // Copiar atributos
        for (let i = 0; i < element.attributes.length; i++) {
          const attr = element.attributes[i];
          html += ` ${attr.name}="${attr.value}"`;
        }
        html += '>';

        let totalLength = currentLength;
        let childrenHtml = '';
        let wasTruncated = false;

        // Procesar nodos hijos
        for (let i = 0; i < node.childNodes.length; i++) {
          const child = node.childNodes[i];
          const result = truncateNode(child, totalLength);
          
          childrenHtml += result.html;
          totalLength = result.length;
          
          if (result.truncated) {
            wasTruncated = true;
            break;
          }
        }

        html += childrenHtml + `</${tagName}>`;
        
        return { html, length: totalLength, truncated: wasTruncated };
      }

      return { html: '', length: currentLength, truncated: false };
    };

    let result = '';
    let totalLength = 0;
    let wasTruncated = false;

    for (let i = 0; i < temp.childNodes.length; i++) {
      const child = temp.childNodes[i];
      const nodeResult = truncateNode(child, totalLength);
      
      result += nodeResult.html;
      totalLength = nodeResult.length;
      
      if (nodeResult.truncated) {
        wasTruncated = true;
        break;
      }
    }

    return wasTruncated ? result + '...' : result;
  };

  const plainText = getPlainText(text);
  
  // Si el texto es corto, mostrarlo completo
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

  // Si es largo, truncar manteniendo el HTML
  const truncatedHtml = truncateHtml(text, maxLength);
  const processedHtml = processLinks(truncatedHtml);
  
  return (
    <div 
      className={`${className} text-gray-600`}
      dangerouslySetInnerHTML={{ __html: processedHtml }}
      style={{ wordBreak: 'break-word' }}
    />
  );
};

export default RichTextSummary; 