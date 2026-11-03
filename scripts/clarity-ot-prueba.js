
'use strict';

const { chromium } = require('playwright');
const { sincronizar } = require('./clarity-supabase-sync');
const fs = require('node:fs');
const path = require('node:path');

const LOGIN_URL =
  'https://app01.moretti.com.ar/app/login.html';

const OUT = __dirname;

const CREDENCIALES = {
  documento: process.env.CLARITY_DOCUMENTO,
  usuario: process.env.CLARITY_USUARIO,
  clave: process.env.CLARITY_CLAVE
};

const FILTROS = {
  estado: '1',
  subestado: '120',
  supervisor: '-1',
  primerTecnico: '-1',
  segundoTecnico: '-1'
};

const esperar = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

function guardarJSON(nombre, datos) {
  const archivo = path.join(OUT, nombre);
  fs.writeFileSync(
    archivo,
    JSON.stringify(datos, null, 2),
    'utf8'
  );
  return archivo;
}

async function esperarFrame(page, patron, segundos = 30) {
  const limite = Date.now() + segundos * 1000;

  while (Date.now() < limite) {
    const frame = page.frames().find(f =>
      patron.test(f.url())
    );

    if (frame) return frame;
    await esperar(300);
  }

  return null;
}

async function diagnosticarMenu(page) {
  const diagnostico = [];

  for (const frame of page.frames()) {
    try {
      const elementos = await frame.evaluate(() =>
        [...document.querySelectorAll('a,span,div,td,li')]
          .filter(el => {
            const texto = (
              el.innerText || el.textContent || ''
            ).trim();

            return texto.length < 100 &&
              /^(Taller|Orden de trabajo)$/i.test(texto);
          })
          .map(el => ({
            tag: el.tagName,
            id: el.id || '',
            clase: String(el.className || ''),
            texto: (el.innerText || '').trim(),
            onclick: el.getAttribute('onclick') || '',
            href: el.getAttribute('href') || '',
            html: el.outerHTML.slice(0, 500)
          }))
      );

      diagnostico.push({
        frame: frame.name(),
        url: frame.url(),
        elementos
      });
    } catch (error) {
      diagnostico.push({
        frame: frame.name(),
        url: frame.url(),
        error: error.message
      });
    }
  }

  guardarJSON('clarity-menu-diagnostico.json', diagnostico);
}

async function clickMenuTexto(page, texto) {
  const selectores = [
    `text="${texto}"`,
    `a:has-text("${texto}")`,
    `span:has-text("${texto}")`,
    `td:has-text("${texto}")`
  ];

  for (const frame of page.frames()) {
    for (const selector of selectores) {
      try {
        const elementos = frame.locator(selector);
        const cantidad = await elementos.count();

        for (let i = 0; i < Math.min(cantidad, 10); i++) {
          const elemento = elementos.nth(i);

          if (await elemento.isVisible()) {
            console.log(
              `Encontrado "${texto}" en frame:`,
              frame.name() || '(principal)'
            );

            await elemento.click({ timeout: 5000 });
            return true;
          }
        }
      } catch (_) {}
    }
  }

  return false;
}

async function abrirOrdenTrabajo(page) {
  console.log('\n================================');
  console.log('NAVEGACIÓN AUTOMÁTICA');
  console.log('================================');

  let filtro = await esperarFrame(
    page,
    /Taller_Tareas_Filtro\.asp/i,
    2
  );

  if (filtro) {
    console.log('Orden de trabajo ya está abierta.');
    return filtro;
  }

  console.log('Buscando menú Taller...');

  if (!await clickMenuTexto(page, 'Taller')) {
    await diagnosticarMenu(page);
    throw new Error('No se pudo abrir el menú Taller.');
  }

  await esperar(700);

  console.log('Buscando Orden de trabajo...');

  let abierta = false;

  for (let intento = 0; intento < 10; intento++) {
    abierta = await clickMenuTexto(
      page,
      'Orden de trabajo'
    );

    if (abierta) break;
    await esperar(500);
  }

  if (!abierta) {
    await diagnosticarMenu(page);
    throw new Error(
      'No se encontró Orden de trabajo.'
    );
  }

  filtro = await esperarFrame(
    page,
    /Taller_Tareas_Filtro\.asp/i,
    30
  );

  if (!filtro) {
    await diagnosticarMenu(page);
    throw new Error(
      'La pantalla de OT no terminó de cargar.'
    );
  }

  console.log(
    'Orden de trabajo abierta automáticamente.'
  );

  return filtro;
}

async function seleccionarFiltro(
  frame,
  selector,
  valor,
  descripcion
) {
  const control = frame.locator(selector);

  await control.waitFor({
    state: 'attached',
    timeout: 15000
  });

  await control.selectOption(valor);

  if (await control.inputValue() !== valor) {
    throw new Error(
      `No se pudo configurar ${descripcion}`
    );
  }

  console.log(`${descripcion}: ${valor}`);
}

async function configurarSelectorTecnico(
  frame,
  campoCodigo,
  campoDescripcion,
  descripcion
) {
  const codigo = frame.locator(campoCodigo);
  const texto = frame.locator(campoDescripcion);

  await codigo.waitFor({
    state: 'visible',
    timeout: 15000
  });

  await texto.waitFor({
    state: 'attached',
    timeout: 15000
  });

  const codigoInicial = await codigo.inputValue();
  const textoInicial = await texto.inputValue();

  console.log(
    `${descripcion} inicial: ${codigoInicial} / ${textoInicial}`
  );

  if (
    codigoInicial === '-1' &&
    textoInicial.trim() === '(Todos)'
  ) {
    console.log(`${descripcion}: ya está en Todos`);
    return;
  }

  // Clarity confirma el selector con Enter.
  // No escribimos en la descripción readonly.
  await codigo.fill('-1');
  await codigo.press('Enter');

  await frame.waitForFunction(
    ({ codigoId, descripcionId }) => {
      const codigo = document.querySelector(codigoId);
      const descripcion = document.querySelector(
        descripcionId
      );

      return codigo?.value === '-1' &&
        descripcion?.value?.trim() === '(Todos)';
    },
    {
      codigoId: campoCodigo,
      descripcionId: campoDescripcion
    },
    { timeout: 15000 }
  );

  console.log(
    `${descripcion}: -1 (Todos) confirmado`
  );
}

async function aplicarFiltros(frame) {
  console.log('\nAplicando filtros...');

  await seleccionarFiltro(
    frame,
    '#cboEstadoID_control',
    FILTROS.estado,
    'Estado Pendiente'
  );

  await esperar(500);

  await seleccionarFiltro(
    frame,
    '#cboSubEstado_control',
    FILTROS.subestado,
    'SubEstado 8 - Garantia'
  );

  const supervisor = frame.locator(
    '#slkSupervisorOT_code'
  );

  if (await supervisor.inputValue() !== '-1') {
    throw new Error(
      'Supervisor no está configurado en Todos.'
    );
  }

  console.log('Supervisor: -1 (Todos)');

  await configurarSelectorTecnico(
    frame,
    '#slkUsuario_code',
    '#slkUsuario_description',
    '1er. Técnico'
  );

  await esperar(400);

  await configurarSelectorTecnico(
    frame,
    '#slkTester_code',
    '#slkTester_description',
    '2do. Técnico'
  );

  const valores = await frame.evaluate(() => {
    const valor = id =>
      document.getElementById(id)?.value ?? null;

    return {
      estado: valor('cboEstadoID_control'),
      subestado: valor('cboSubEstado_control'),
      supervisor: valor('slkSupervisorOT_code'),
      primerTecnico: valor('slkUsuario_code'),
      segundoTecnico: valor('slkTester_code'),
      primerTecnicoDescripcion:
        valor('slkUsuario_description'),
      segundoTecnicoDescripcion:
        valor('slkTester_description')
    };
  });

  for (const [campo, esperado] of Object.entries(FILTROS)) {
    if (valores[campo] !== esperado) {
      throw new Error(
        `Filtro incorrecto: ${campo}. ` +
        `Esperado ${esperado}, actual ${valores[campo]}`
      );
    }
  }

  if (
    valores.primerTecnicoDescripcion !== '(Todos)' ||
    valores.segundoTecnicoDescripcion !== '(Todos)'
  ) {
    throw new Error(
      'La descripción de técnicos no está en Todos.'
    );
  }

  guardarJSON('clarity-filtros-aplicados.json', {
    fecha: new Date().toISOString(),
    filtros: valores
  });

  console.log('Todos los filtros verificados.');
  return valores;
}

async function presionarListar(page) {
  console.log('\nBuscando botón Listar...');

  for (const frame of page.frames()) {
    const candidatos = [
      frame.locator('input[value="Listar"]'),
      frame.locator('button:has-text("Listar")'),
      frame.getByText('Listar', { exact: true })
    ];

    for (const candidato of candidatos) {
      try {
        const boton = candidato.first();

        if (await boton.isVisible()) {
          console.log('Presionando Listar...');
          await boton.click({ timeout: 10000 });
          console.log('Listar presionado.');
          return;
        }
      } catch (_) {}
    }
  }

  throw new Error('No se encontró el botón Listar.');
}

async function extraerFilas(frame) {
  return frame.evaluate(() => {
    const limpiar = texto =>
      String(texto ?? '').replace(/\s+/g, ' ').trim();

    const patronOT = /^OS\.-?\d{5,}$/i;
    const patronFecha = /^\d{2}\/\d{2}\/\d{4}$/;
    const filas = [];
    // Solo una columna titulada explícitamente FechaFinalizacion es válida.
    // "Fecha Final. Vehículo" NO es la fecha de cierre de la OT.
    const normalizarTitulo = v => limpiar(v).normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const encabezados = [...document.querySelectorAll('tr')].map(tr =>
      [...tr.children].filter(el => /^(TH|TD)$/.test(el.tagName))
        .map(el => normalizarTitulo(el.innerText || el.textContent))
    );
    const cabecera = encabezados.find(h => h.includes('fechafinalizacion') && h.includes('documento'));
    const indiceFechaFinalizacion = cabecera ? cabecera.indexOf('fechafinalizacion') : -1;

    for (const tr of document.querySelectorAll('tr')) {
      const celdas = [...tr.children].filter(
        el => el.tagName === 'TD'
      );

      if (!celdas.length) continue;

      const valores = celdas.map(td =>
        limpiar(td.innerText || td.textContent)
      );

      const ot = valores.find(v => patronOT.test(v));
      const fecha = valores.find(v => patronFecha.test(v));

      if (!ot || !fecha) continue;

      filas.push({ ot, fecha, valores, ...(indiceFechaFinalizacion >= 0 && valores[indiceFechaFinalizacion] ? { fechaFinalizacion: valores[indiceFechaFinalizacion] } : {}) });
    }

    const vistos = new Set();

    return filas.filter(fila => {
      // No deduplicar por número de OT:
      // una OT puede tener más de un equipo.
      const clave = JSON.stringify(fila.valores);

      if (vistos.has(clave)) return false;

      vistos.add(clave);
      return true;
    });
  });
}

function obtenerFrameListado(page) {
  return page.frames().find(f =>
    /\/lvw_List\.asp/i.test(f.url())
  );
}

async function esperarResultados(page) {
  console.log('Esperando resultados...');

  const limite = Date.now() + 30000;

  while (Date.now() < limite) {
    const frame = obtenerFrameListado(page);

    if (frame) {
      try {
        const registros = await extraerFilas(frame);

        if (registros.length) {
          return { frame, registros };
        }
      } catch (_) {}
    }

    await esperar(500);
  }

  throw new Error(
    'No se obtuvieron OT en 30 segundos.'
  );
}

// Diagnóstico de los controles reales del paginador.
async function diagnosticarPaginador(page) {
  const resultado = [];

  for (const frame of page.frames()) {
    if (!/pagin|listview|lvw_list/i.test(
      frame.name() + ' ' + frame.url()
    )) {
      continue;
    }

    try {
      const datos = await frame.evaluate(() => ({
        texto: (document.body?.innerText || '')
          .slice(0, 1500),

        controles: [
          ...document.querySelectorAll(
            'a,button,input,select,img'
          )
        ].slice(0, 100).map(el => ({
          tag: el.tagName,
          id: el.id || '',
          name: el.name || '',
          texto: (
            el.innerText || el.value || ''
          ).trim().slice(0, 90),
          titulo: el.title || '',
          alt: el.alt || '',
          href: el.getAttribute('href'),
          onclick: el.getAttribute('onclick'),
          disabled: Boolean(el.disabled)
        }))
      }));

      resultado.push({
        frame: frame.name(),
        url: frame.url(),
        datos
      });
    } catch (error) {
      resultado.push({
        frame: frame.name(),
        url: frame.url(),
        error: error.message
      });
    }
  }

  guardarJSON(
    'clarity-paginador-diagnostico.json',
    resultado
  );

  return resultado;
}

async function leerPaginacion(page) {
  const frames = page.frames().filter(f =>
    /pagin/i.test(f.name() + ' ' + f.url())
  );

  const info = [];

  for (const frame of frames) {
    try {
      const datos = await frame.evaluate(() => {
        const texto = (
          document.body?.innerText || ''
        ).replace(/\s+/g, ' ').trim();

        const botones = [
          ...document.querySelectorAll(
            'a,button,input[type=button],input[type=image]'
          )
        ].map((el, indice) => ({
          indice,
          texto: [
            el.innerText,
            el.value,
            el.title,
            el.getAttribute('aria-label'),
            el.alt,
            el.querySelector('img')?.alt,
            el.querySelector('img')?.title
          ].filter(Boolean).join(' ').trim(),

          disabled: Boolean(el.disabled) ||
            el.getAttribute('aria-disabled') === 'true',

          href: el.getAttribute('href') || '',
          onclick: el.getAttribute('onclick') || ''
        }));

        return { texto, botones };
      });

      info.push({ frame, ...datos });
    } catch (_) {}
  }

  return info;
}

function contarPaginas(info) {
  const patrones = [
    /p[aá]gina\s*(\d+)\s*(?:de|\/)\s*(\d+)/i,
    /\b(\d+)\s+de\s+(\d+)\s+p[aá]ginas?/i,
    /\bp[aá]ginas?\s*:\s*(\d+)\s*\/\s*(\d+)/i
  ];

  for (const item of info) {
    for (const patron of patrones) {
      const coincidencia = item.texto.match(patron);

      if (coincidencia) {
        return {
          actual: Number(coincidencia[1]),
          total: Number(coincidencia[2])
        };
      }
    }
  }

  return null;
}

async function extraerTodasLasPaginas(page, primera) {
  const registros = [...primera.registros];

  const paginas = [{
    numero: 1,
    filas: primera.registros.length
  }];

  const vistos = new Set(
    registros.map(r => JSON.stringify(r.valores))
  );

  const infoInicial = await leerPaginacion(page);
  const conteo = contarPaginas(infoInicial);

  // Siempre guardar el diagnóstico para inspección.
  await diagnosticarPaginador(page);

  if (!conteo) {
    throw new Error(
      'No pude determinar la cantidad de páginas. ' +
      'No se exportará un listado posiblemente incompleto. ' +
      'Revisar clarity-paginador-diagnostico.json.'
    );
  }

  console.log(
    `Paginación: ${conteo.actual} de ${conteo.total}`
  );

  if (
    conteo.actual !== 1 ||
    conteo.total < 1 ||
    conteo.total > 1000
  ) {
    throw new Error(
      'Numeración de páginas inesperada.'
    );
  }

  if (conteo.total === 1) {
    return {
      registros,
      paginas,
      totalPaginas: 1
    };
  }

  for (
    let pagina = 2;
    pagina <= conteo.total;
    pagina++
  ) {
    const info = await leerPaginacion(page);
    const candidatos = [];

    for (const item of info) {
      for (const boton of item.botones) {
        if (
          !boton.disabled &&
          /^(siguiente|next|>|»|›)$/i.test(
            boton.texto
          )
        ) {
          candidatos.push({
            frame: item.frame,
            boton
          });
        }
      }
    }

    if (candidatos.length !== 1) {
      throw new Error(
        `Página ${pagina}: no se identificó ` +
        'un único botón Siguiente.'
      );
    }

    const frameAnterior = obtenerFrameListado(page);

    const firmaAnterior = frameAnterior
      ? JSON.stringify(
          (await extraerFilas(frameAnterior))
            .map(r => r.valores)
        )
      : '';

    const { frame, boton } = candidatos[0];

    await frame.locator(
      'a,button,input[type=button],input[type=image]'
    ).nth(boton.indice).click({
      timeout: 10000
    });

    const limite = Date.now() + 30000;
    let nuevos = null;

    while (Date.now() < limite) {
      await esperar(350);

      const frameActual = obtenerFrameListado(page);
      if (!frameActual) continue;

      try {
        const filas = await extraerFilas(frameActual);

        const firmaActual = JSON.stringify(
          filas.map(r => r.valores)
        );

        if (
          filas.length &&
          firmaActual !== firmaAnterior
        ) {
          nuevos = filas;
          break;
        }
      } catch (_) {}
    }

    if (!nuevos) {
      throw new Error(
        `No se confirmó el cambio a página ${pagina}.`
      );
    }

    for (const registro of nuevos) {
      const clave = JSON.stringify(
        registro.valores
      );

      if (!vistos.has(clave)) {
        vistos.add(clave);
        registros.push(registro);
      }
    }

    paginas.push({
      numero: pagina,
      filas: nuevos.length
    });

    console.log(
      `Página ${pagina}/${conteo.total}: ` +
      `${nuevos.length} filas`
    );
  }

  return {
    registros,
    paginas,
    totalPaginas: conteo.total
  };
}

function generarCSV(registros) {
  const ancho = Math.max(
    ...registros.map(r => r.valores.length)
  );

  const encabezados = Array.from(
    { length: ancho },
    (_, i) => `columna_${i + 1}`
  );

  const filas = [
    encabezados,
    ...registros.map(r => r.valores)
  ];

  return '\uFEFF' + filas.map(fila =>
    Array.from(
      { length: ancho },
      (_, i) => {
        const valor = String(
          fila[i] ?? ''
        ).replace(/"/g, '""');

        return `"${valor}"`;
      }
    ).join(';')
  ).join('\r\n');
}


function rangoFinalizadas(){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const fin=new Date(today+'T00:00:00Z'),desde=new Date(fin),hasta=new Date(fin);
 desde.setUTCDate(desde.getUTCDate()-10);hasta.setUTCDate(hasta.getUTCDate()-1);
 return {desde:desde.toISOString().slice(0,10),hasta:hasta.toISOString().slice(0,10)};
}
async function aplicarFinalizadas(frame){
 const rango=rangoFinalizadas();
 const controles=await frame.evaluate(()=>[...document.querySelectorAll('input,select')].map(e=>({id:e.id,name:e.name,type:e.type,value:e.value,label:(e.closest('tr')?.innerText||'').slice(0,140),options:e.tagName==='SELECT'?[...e.options].map(o=>({value:o.value,text:o.text.trim()})):[]})));
 guardarJSON('clarity-finalizadas-controles.json',{rango,controles});
 const estado=controles.find(c=>c.id==='cboEstadoID_control');
 const final=estado?.options.find(o=>/^finalizad[oa]$/i.test(o.text));
 if(!final)throw Error('No se encontró Estado Finalizado en Clarity');
 await seleccionarFiltro(frame,'#cboEstadoID_control',final.value,'Estado Finalizado');
 await esperar(500);
 const opciones=await frame.locator('#cboSubEstado_control option').evaluateAll(a=>a.map(o=>({value:o.value,text:o.text.trim()})));
 const todos=opciones.find(o=>/^\(?todos\)?$/i.test(o.text));
 if(!todos)throw Error('No se encontró Subestado Todos');
 await frame.locator('#cboSubEstado_control').selectOption(todos.value);
 const tipos=controles.filter(c=>c.id!=='cboEstadoID_control'&&c.options.some(o=>/finalizaci[oó]n/i.test(o.text)));
 if(tipos.length!==1||!tipos[0].id)throw Error('Selector Tipo Fecha no identificado; ver claridad-finalizadas-controles.json');
 const tipo=tipos[0],op=tipo.options.find(o=>/finalizaci[oó]n/i.test(o.text));
 await frame.locator('#'+tipo.id).selectOption(op.value);
 const fechas=controles.filter(c=>c.type!=='hidden'&&c.id&&!c.options.length);
 const buscar=(patron)=>fechas.filter(c=>patron.test(c.id+' '+c.name));
 let desde=buscar(/desde|fec.*ini|fecha.*ini|start/i);
 let hasta=buscar(/hasta|fec.*fin|fecha.*fin|end/i);
 if(desde.length!==1||hasta.length!==1){
   const candidatos=fechas.filter(c=>/^(?:\d{2}\/\d{2}\/\d{4})?$/.test(c.value)&&/fecha|fec|date/i.test(c.id+' '+c.name));
   if(candidatos.length===2){desde=[candidatos[0]];hasta=[candidatos[1]];}
 }
 if(desde.length!==1||hasta.length!==1){
   console.log('DIAGNÓSTICO CAMPOS FECHA:',JSON.stringify(fechas.map(c=>({id:c.id,name:c.name,value:c.value,type:c.type}))));
   throw Error('Campos de fechas no identificados; revisar claridad-finalizadas-controles.json');
 }
 const fmt=s=>s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4);
 await frame.locator('#'+desde[0].id).fill(fmt(rango.desde));
 await frame.locator('#'+hasta[0].id).fill(fmt(rango.hasta));
 await configurarSelectorTecnico(frame,'#slkUsuario_code','#slkUsuario_description','1er. Técnico');
 await configurarSelectorTecnico(frame,'#slkTester_code','#slkTester_description','2do. Técnico');
 const ver=await frame.evaluate(ids=>Object.fromEntries(ids.map(id=>[id,document.getElementById(id)?.value])),[estado.id,'cboSubEstado_control',tipo.id,desde[0].id,hasta[0].id]);
 if(ver[estado.id]!==final.value||ver['cboSubEstado_control']!==todos.value||ver[tipo.id]!==op.value||ver[desde[0].id]!==fmt(rango.desde)||ver[hasta[0].id]!==fmt(rango.hasta))throw Error('No se conservaron los filtros');
 return rango;
}

async function main() {
  if (Object.values(CREDENCIALES).some(v => !v)) {
    throw new Error(
      'Faltan las variables de entorno de Clarity.'
    );
  }

  const browser = await chromium.launch({
    headless: process.env.CLARITY_HEADLESS === 'true',
    slowMo: process.env.CLARITY_HEADLESS === 'true' ? 0 : 70
  });

  const context = await browser.newContext({
    viewport: {
      width: 1600,
      height: 950
    }
  });

  const page = await context.newPage();

  try {
    console.log('Iniciando Clarity...');

    await page.goto(LOGIN_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    await page.locator('#txtDNI').fill(
      CREDENCIALES.documento
    );

    await page.locator('#txtUsuario').fill(
      CREDENCIALES.usuario
    );

    await page.locator('#txtPassword').fill(
      CREDENCIALES.clave
    );

    await page.getByText(
      'Ingresar',
      { exact: true }
    ).first().click();

    await page.waitForURL(
      /Principal2\.asp/i,
      { timeout: 60000 }
    );

    console.log('Login correcto.');

    // Navegación completamente automática.
    const frameFiltro = await abrirOrdenTrabajo(page);

    // Aplicación de filtros.
    const verificacion = await aplicarFiltros(
      frameFiltro
    );

    // Ejecutar consulta.
    await presionarListar(page);

    await esperar(2500);

    // Leer primera página.
    const primera = await esperarResultados(page);

    console.log(
      'Primera página:',
      primera.registros.length,
      'filas'
    );

    // NUEVO: detectar y recorrer paginación.
    const extraccion = await extraerTodasLasPaginas(
      page,
      primera
    );

    const registros = extraccion.registros;

    const salida = {
      fechaExtraccion: new Date().toISOString(),

      filtros: {
        estado: 'Pendiente',
        estadoID: 1,
        subestado: '8 - Garantia',
        subestadoID: 120,
        supervisor: 'Todos',
        primerTecnico: 'Todos',
        segundoTecnico: 'Todos'
      },

      valoresVerificados: verificacion,

      urlListado: primera.frame.url(),

      cantidad: registros.length,

      totalPaginas: extraccion.totalPaginas,

      paginas: extraccion.paginas,

      registros
    };

    const archivoJSON = guardarJSON(
      'clarity-ot-prueba.json',
      salida
    );

    const archivoCSV = path.join(
      OUT,
      'clarity-ot-prueba.csv'
    );

    fs.writeFileSync(
      archivoCSV,
      generarCSV(registros),
      'utf8'
    );

    console.log('\n================================');
    console.log('EXTRACCIÓN FINALIZADA');
    console.log('================================');

    console.log(
      'Páginas recorridas:',
      extraccion.totalPaginas
    );

    console.log(
      'Filas recuperadas:',
      registros.length
    );

    console.log('JSON:', archivoJSON);
    console.log('CSV:', archivoCSV);

    console.log(
      '\nPrimeras 3 OT:'
    );

    console.log(
      JSON.stringify(
        registros.slice(0, 3),
        null,
        2
      )
    );

    const resultadoSync = await sincronizar(registros);
    console.log('Resultado Supabase:', JSON.stringify(resultadoSync));
    if(process.env.CLARITY_FINALIZADAS_ENABLED==='true'){
      let rango;
      try { rango=await aplicarFinalizadas(frameFiltro); }
      catch(error){console.error('FINALIZADAS: filtros pendientes de ajuste:',error.message);rango=null;}
      if(rango){
      await presionarListar(page);
      await esperar(2500);
      const primeraFinal=await esperarResultados(page);
      const finalizadas=await extraerTodasLasPaginas(page,primeraFinal);
      guardarJSON('clarity-finalizadas-diagnostico.json',{rango,registros:finalizadas.registros});
      const conFecha=finalizadas.registros.filter(r=>r.fechaFinalizacion).length;
      console.log('Finalizadas con FechaFinalizacion explícita:',conFecha,'de',finalizadas.registros.length);
      console.log('OT finalizadas extraídas:',finalizadas.registros.length,'Rango:',JSON.stringify(rango));
      if(process.env.CLARITY_FINALIZADAS_WRITE==='true'){
        if(finalizadas.registros.some(r=>!r.fechaFinalizacion))throw Error('Escritura bloqueada: la grilla no expone FechaFinalizacion. No se usará Fecha Final. Vehículo.');
        const resultado=await sincronizar(finalizadas.registros,{estado:'Finalizado',fechaDesde:rango.desde,fechaHasta:rango.hasta});
        console.log('Resultado Supabase finalizadas:',JSON.stringify(resultado));
      }else console.log('OT finalizadas en modo diagnóstico: sin escritura');
      }
    }

  } catch (error) {
    console.error(
      '\nERROR:',
      error.message
    );

    process.exitCode = 1;

    await diagnosticarMenu(page).catch(() => {});

    await page.screenshot({
      path: path.join(
        OUT,
        'clarity-ot-error.png'
      ),
      fullPage: true
    }).catch(() => {});

  } finally {
    console.log('\nCerrando Chromium...');
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
