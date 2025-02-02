document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const contentType = urlParams.get('type');
  const filename = urlParams.get('file');
  
  // Check if we're on a documentation page
  if (window.location.pathname.includes('/docs') || 
      window.location.pathname.includes('/template')) {
    await loadSidebarLinks(contentType, filename);
  }
  
  if (contentType && filename) {
    await loadTemplateContent(contentType, filename);
  }

  // Remove skeleton loaders when content is loaded
  document.querySelectorAll('.skeleton').forEach(skeleton => {
    skeleton.remove();
  });
});

async function loadSidebarLinks(activeType, activeFile) {
  try {
    let sidebarContent = '';
    const types = ['docs', 'wiki', 'tutorials'];
    const basePath = window.location.pathname.includes('/template') ? '/' : '';

    for (const type of types) {
      try {
        const response = await fetch(`/content/${type}/index.txt`);
        if (!response.ok) {
          console.log(`No index file found for ${type}`);
          continue;
        }

        const indexContent = await response.text();
        const files = indexContent.split('\n')
          .filter(line => line.trim())
          .map(line => {
            const [name, title] = line.split(':');
            return { name: name.trim(), title: title.trim() };
          });

        if (files.length > 0) {
          sidebarContent += `
            <h2>${formatTitle(type)}</h2>
            ${files.map(file => `
              <a href="/template?type=${type}&file=${file.name}" 
                 class="${activeType === type && activeFile === file.name ? 'active' : ''}">${file.title}</a>
            `).join('')}
          `;
        }
      } catch (error) {
        console.error(`Error loading ${type} index:`, error);
      }
    }

    const sidebarElement = document.querySelector('.doc-links') || document.querySelector('#sidebar-links');
    if (sidebarElement) {
      sidebarElement.innerHTML = sidebarContent;
    }
  } catch (error) {
    console.error('Error loading sidebar:', error);
  }
}

function formatTitle(filename) {
  return filename
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function loadTemplateContent(contentType, filename) {
  try {
    const basePath = window.location.pathname.includes('/template') ? '/' : '';
    const response = await fetch(`/content/${contentType}/${filename}.txt`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    let text = await response.text();
    
    // Just remove frontmatter without adding timestamp
    text = text.replace(/^---[\s\S]*?---\s*\n+/, '');
    
    // Process the rest of the markdown
    text = text
      // Handle headers first
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      
      // Handle double dashes
      .replace(/--(.+?)--/g, '<span class="italic-text">$1</span>')
      
      // Handle code comments
      .replace(/^\/\/ (.+)$/gm, '<code>$1</code>')
      
      // Handle block comments
      .replace(/\/\*([\s\S]*?)\*\//g, (match, content) => {
        const lines = content.trim().split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0);
        return `<pre class="block-comment">${lines.join('\n')}</pre>`;
      })
      
      // Handle download buttons
      .replace(/<dl>(.*?)<\/dl>/g, '<a href="$1" class="download-link">Download <i class="fas fa-download"></i></a>')
      
      // Handle visit buttons
      .replace(/<visit>(.*?)<\/visit>/g, '<a href="$1" class="visit-link">Visit <i class="fas fa-external-link-alt"></i></a>')
      
      // Handle images and gifs
      .replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" class="content-image">');

    document.getElementById('content').innerHTML = text;
    document.title = `${formatTitle(filename)} - T7Mods`;
    
  } catch (error) {
    console.error('Error loading content:', error);
    document.getElementById('content').innerHTML = `
      <h1>Error</h1>
      <p>Failed to load content. Please try again later.</p>
    `;
  }
} 