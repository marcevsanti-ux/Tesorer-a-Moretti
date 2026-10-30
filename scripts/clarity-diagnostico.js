'use strict';
// Diagnóstico de Clarity: SOLO LECTURA. No modifica Clarity ni Supabase.
// Requiere: npm install --no-save playwright && npx playwright install chromium
// Variables: CLARITY_DOCUMENTO, CLARITY_USUARIO, CLARITY_CLAVE
const { chromium } = require('playwright');
const fs = require('node:fs/promises');

const BASE = 'https://app01.moretti.com.ar';
const LOGIN = BASE + '/app/login.html';
const env = ['CLARITY_DOCUMENTO', 'CLARITY_USUARIO', 'CLARITY_CLAVE'];
for (const name of env) {
  if (!process.env[name]) throw Error('Falta variable de entorno: ' + name);
}
const browser = awaitBrowser();
async function awaitBrowser() {
  const b = await chromium.launch({ headless: true });
  const page = await b.newPage({ acceptDownloads: false });
  try {
    await page.goto(LOGIN, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Diagnóstico inicial: inspeccionamos campos sin enviar credenciales hasta
    // confirmar selectores y flujo de autenticación de Clarity.
    const fields = await page.locator('input').evaluateAll(nodes => nodes.map(n => ({
      type: n.type, name: n.name, id: n.id, placeholder: n.placeholder
    })));
    const result = { timestamp: new Date().toISOString(), url: page.url(), fields };
    await fs.writeFile('clarity-diagnostico.json', JSON.stringify(result, null, 2));
    console.log('Diagnóstico generado: clarity-diagnostico.json');
    console.log('No se enviaron credenciales ni se consultaron OT.');
  } finally {
    await b.close();
  }
  return null;
}
