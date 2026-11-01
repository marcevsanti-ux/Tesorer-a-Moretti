/* Asistente Moretti: acceso seguro al chat de Puentes.ai.
   No contiene claves, tokens ni credenciales de MCP. */
(function () {
  'use strict';
  const url = window.MORETTI_PUENTES_CHAT_URL || 'https://app.puentes.ai/';
  function init() {
    if (document.getElementById('moretti-assistant-launcher')) return;
    const style = document.createElement('style');
    style.textContent = `
      #moretti-assistant-launcher{position:fixed;right:22px;bottom:22px;z-index:9000;font:600 14px Arial,sans-serif}
      #moretti-assistant-launcher button{background:#c6000a;color:#fff;border:1px solid #ff454b;border-radius:28px;padding:14px 18px;box-shadow:0 8px 30px #0009;cursor:pointer}
      #moretti-assistant-launcher button:hover{background:#e1000d}
      #moretti-assistant-panel{display:none;position:absolute;bottom:64px;right:0;width:min(350px,calc(100vw - 30px));padding:20px;border:1px solid #333;border-radius:14px;background:#151515;color:#eee;box-shadow:0 14px 45px #000a;line-height:1.5}
      #moretti-assistant-panel[data-open="true"]{display:block}
      #moretti-assistant-panel h3{font-size:17px;margin:0 0 10px}
      #moretti-assistant-panel p{font-weight:400;color:#bbb;margin:0 0 16px}
      #moretti-assistant-panel a{display:block;text-align:center;background:#c6000a;color:white;padding:11px;border-radius:9px;text-decoration:none}
      @media(max-width:600px){#moretti-assistant-launcher{right:14px;bottom:14px}}
    `;
    document.head.appendChild(style);
    const root = document.createElement('div');
    root.id = 'moretti-assistant-launcher';
    root.innerHTML = '<div id="moretti-assistant-panel" role="region" aria-label="Asistente Moretti"><h3>Asistente Moretti</h3><p>Consultá los reclamos con el asistente conectado al MCP de Moretti. El chat se abre en Puentes.ai, con tu propia sesión.</p><a id="moretti-assistant-open" target="_blank" rel="noopener noreferrer">Abrir chat en Puentes.ai</a></div><button type="button" id="moretti-assistant-toggle" aria-expanded="false" aria-controls="moretti-assistant-panel">✦ Asistente Moretti</button>';
    document.body.appendChild(root);
    root.querySelector('#moretti-assistant-open').href = url;
    const toggle = root.querySelector('#moretti-assistant-toggle');
    const panel = root.querySelector('#moretti-assistant-panel');
    toggle.addEventListener('click', () => {
      const open = panel.dataset.open !== 'true';
      panel.dataset.open = String(open);
      toggle.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { panel.dataset.open = 'false'; toggle.setAttribute('aria-expanded','false'); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
