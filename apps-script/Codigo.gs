/**
 * Tritic · Cotizador 3D — servidor de solicitudes
 * Google Apps Script (aplicación web)
 *
 * Qué hace:
 *  - Asigna folios consecutivos CTI-0001, CTI-0002…
 *  - Guarda cada solicitud en una carpeta de Google Drive con los modelos del cliente
 *  - Registra cada cotización en una hoja de cálculo
 *  - Avisa al equipo por correo (con los modelos adjuntos si son ligeros) y confirma al cliente
 *
 * Instalación: ver GUIA-INSTALACION.md
 */

// ======================= CONFIGURACIÓN =======================
const CFG = {
  EMAIL_EQUIPO: 'oscar.talavera@tritic3d.com,contacto@tritic3d.com',        // a quién llegan las solicitudes (varios: separados por coma)
  NOMBRE_REMITENTE: 'Tritic · Cotizador 3D',
  PREFIJO: 'CTI-',
  DIGITOS: 4,                                  // CTI-0001
  FOLIO_INICIAL: 1,                            // primer número que se asignará
  CONFIRMAR_AL_CLIENTE: true,                  // enviar acuse al cliente
  ADJUNTAR_HASTA_MB: 20,                       // si los modelos pesan menos, se adjuntan al correo del equipo
  MAX_ARCHIVO_MB: 30,                          // límite por archivo (debe coincidir con la página)
  WHATSAPP_EQUIPO: '526145516027',                         // opcional, p. ej. '526141234567': se incluye como enlace en el correo al cliente

  // Opcional: aviso automático por WhatsApp al equipo mediante WhatsApp Cloud API (Meta).
  // Requiere cuenta de WhatsApp Business verificada y una plantilla aprobada con 3 variables: {{1}} folio, {{2}} cliente, {{3}} total.
  WHATSAPP_API: { activo: false, token: '', phoneNumberId: '', destino: '', plantilla: 'nueva_solicitud', idioma: 'es_MX' }
};
// =============================================================

const COLS = ['Folio', 'Fecha', 'Estado', 'Nombre', 'Empresa', 'Correo', 'Teléfono', 'Piezas', 'Subtotal', 'Total', 'Entrega', 'Carpeta', 'Notas', 'Detalle', 'Token'];
const C = Object.fromEntries(COLS.map((c, i) => [c, i + 1]));

/** Ejecútala una vez desde el editor: crea la carpeta y la hoja de registro. */
function configurar() {
  const props = PropertiesService.getScriptProperties();
  let carpeta;
  const idC = props.getProperty('CARPETA_ID');
  if (idC) carpeta = DriveApp.getFolderById(idC);
  else { carpeta = DriveApp.createFolder('Cotizaciones CTI · Cotizador 3D'); props.setProperty('CARPETA_ID', carpeta.getId()); }
  let ss;
  const idH = props.getProperty('HOJA_ID');
  if (idH) ss = SpreadsheetApp.openById(idH);
  else {
    ss = SpreadsheetApp.create('Registro de cotizaciones CTI');
    DriveApp.getFileById(ss.getId()).moveTo(carpeta);
    props.setProperty('HOJA_ID', ss.getId());
    const sh = ss.getSheets()[0];
    sh.setName('Cotizaciones');
    sh.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.hideColumns(C.Token);
    sh.setColumnWidth(C.Detalle, 320);
  }
  if (!props.getProperty('CONTADOR')) props.setProperty('CONTADOR', String(CFG.FOLIO_INICIAL - 1));
  Logger.log('Carpeta: ' + carpeta.getUrl());
  Logger.log('Hoja: ' + ss.getUrl());
  Logger.log('Siguiente folio: ' + formatoFolio(Number(props.getProperty('CONTADOR')) + 1));
}

function doGet() { return salida({ ok: true, servicio: 'Cotizador Tritic', version: 1 }); }

function doPost(e) {
  let r;
  try {
    const d = JSON.parse(e.postData.contents);
    switch (d.accion) {
      case 'registrar': r = registrar(d.cotizacion, 'PDF descargado'); break;
      case 'crear': r = crear(d); break;
      case 'archivo': r = archivo(d); break;
      case 'finalizar': r = finalizar(d); break;
      default: throw new Error('Acción no válida.');
    }
  } catch (err) {
    r = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return salida(r);
}

// ---------- Acciones ----------
function registrar(cot, estado) {
  validarCotizacion(cot);
  const folio = siguienteFolio();
  const token = Utilities.getUuid();
  const fila = new Array(COLS.length).fill('');
  fila[C.Folio - 1] = folio;
  fila[C.Fecha - 1] = new Date();
  fila[C.Estado - 1] = estado;
  llenarCotizacion(fila, cot);
  fila[C.Token - 1] = token;
  hoja().appendRow(fila);
  return { ok: true, folio, token };
}

function crear(d) {
  const cli = d.cliente || {};
  if (!cli.nombre || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cli.correo || '')) throw new Error('Faltan nombre o correo válido.');
  validarCotizacion(d.cotizacion);
  let folio = d.folio, token = d.token, fila = null;
  // Reutiliza el folio si el cliente ya descargó esta misma cotización en PDF
  if (folio && token) {
    fila = buscar(folio);
    if (!fila || valor(fila, 'Token') !== token || valor(fila, 'Estado') !== 'PDF descargado') fila = null;
  }
  if (!fila) { const r = registrar(d.cotizacion, 'Recibiendo archivos'); folio = r.folio; token = r.token; fila = buscar(folio); }
  const sh = hoja();
  const carpeta = raiz().createFolder(folio + ' · ' + limpio(cli.nombre).slice(0, 60));
  const f = new Array(COLS.length);
  sh.getRange(fila, 1, 1, COLS.length).getValues()[0].forEach((v, i) => (f[i] = v));
  f[C.Estado - 1] = 'Recibiendo archivos';
  f[C.Nombre - 1] = limpio(cli.nombre); f[C.Empresa - 1] = limpio(cli.empresa); f[C.Correo - 1] = limpio(cli.correo);
  f[C['Teléfono'] - 1] = limpio(cli.tel); f[C.Notas - 1] = limpio(cli.notas).slice(0, 2000);
  f[C.Carpeta - 1] = carpeta.getUrl();
  llenarCotizacion(f, d.cotizacion);
  sh.getRange(fila, 1, 1, COLS.length).setValues([f]);
  carpeta.createFile(folio + ' - resumen.txt', String(d.cotizacion.texto || ''), MimeType.PLAIN_TEXT);
  return { ok: true, folio, token };
}

function archivo(d) {
  const fila = autorizar(d);
  const nombre = limpio(d.nombre).replace(/[\\/:*?"<>|]/g, '_').slice(0, 150) || 'modelo';
  if (!/\.(stl|stp|step)$/i.test(nombre)) throw new Error('Tipo de archivo no permitido.');
  const bytes = Utilities.base64Decode(String(d.b64 || ''));
  if (!bytes.length) throw new Error('Archivo vacío.');
  if (bytes.length > CFG.MAX_ARCHIVO_MB * 1048576) throw new Error('El archivo supera ' + CFG.MAX_ARCHIVO_MB + ' MB.');
  const carpeta = carpetaDe(fila);
  const f = carpeta.createFile(Utilities.newBlob(bytes, 'application/octet-stream', nombre));
  return { ok: true, url: f.getUrl() };
}

function finalizar(d) {
  const fila = autorizar(d);
  const sh = hoja();
  const f = sh.getRange(fila, 1, 1, COLS.length).getValues()[0];
  const get = (k) => f[C[k] - 1];
  const folio = get('Folio');
  const cot = JSON.parse(get('Detalle') || '{}');
  const carpeta = carpetaDe(fila);
  const modelos = [];
  const it = carpeta.getFiles();
  while (it.hasNext()) { const x = it.next(); if (/\.(stl|stp|step)$/i.test(x.getName())) modelos.push(x); }
  const pesoTotal = modelos.reduce((a, x) => a + x.getSize(), 0);
  const adjuntos = pesoTotal <= CFG.ADJUNTAR_HASTA_MB * 1048576 ? modelos.map((x) => x.getBlob()) : [];
  const omitidos = (d.omitidos || []).map(limpio);

  const tabla = tablaHtml(cot.lineas || []);
  const mxn = (v) => v == null ? '—' : '$' + Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const htmlEquipo =
    '<div style="font-family:Arial,sans-serif;color:#0E1B24;font-size:14px;line-height:1.5">' +
    '<h2 style="color:#00476A;margin:0 0 8px">Nueva solicitud ' + folio + '</h2>' +
    '<p><b>' + esc(get('Nombre')) + '</b>' + (get('Empresa') ? ' · ' + esc(get('Empresa')) : '') + '<br>' +
    esc(get('Correo')) + (get('Teléfono') ? ' · ' + esc(get('Teléfono')) : '') + '</p>' +
    tabla +
    '<p>Entrega: ' + esc(cot.entrega || '') + '<br>Subtotal: ' + mxn(cot.subtotal) + ' · IVA: ' + mxn(cot.iva) + ' · <b>Total: ' + mxn(cot.total) + '</b></p>' +
    (get('Notas') ? '<p><b>Notas del cliente:</b><br>' + esc(get('Notas')).replace(/\n/g, '<br>') + '</p>' : '') +
    '<p><a href="' + carpeta.getUrl() + '">Abrir carpeta con los modelos en Drive</a>' +
    (adjuntos.length ? ' (también van adjuntos)' : ' (pesan demasiado para adjuntarlos)') + '</p>' +
    (omitidos.length ? '<p style="color:#A15300"><b>No se subieron por tamaño:</b> ' + esc(omitidos.join(', ')) + '. Hay que pedírselos al cliente.</p>' : '') +
    '</div>';
  MailApp.sendEmail({
    to: CFG.EMAIL_EQUIPO, subject: 'Solicitud ' + folio + ' · ' + get('Nombre') + ' · ' + mxn(cot.total),
    htmlBody: htmlEquipo, body: String(cot.texto || ''), replyTo: get('Correo'), name: CFG.NOMBRE_REMITENTE, attachments: adjuntos
  });

  if (CFG.CONFIRMAR_AL_CLIENTE) {
    const wa = CFG.WHATSAPP_EQUIPO ? '<p>¿Dudas? Escríbenos por <a href="https://wa.me/' + CFG.WHATSAPP_EQUIPO + '?text=' + encodeURIComponent('Hola, tengo una duda sobre la solicitud ' + folio) + '">WhatsApp</a> o responde a este correo.</p>' : '<p>¿Dudas? Responde a este correo.</p>';
    MailApp.sendEmail({
      to: get('Correo'), subject: 'Recibimos tu solicitud ' + folio, name: CFG.NOMBRE_REMITENTE, replyTo: CFG.EMAIL_EQUIPO.split(',')[0].trim(),
      htmlBody: '<div style="font-family:Arial,sans-serif;color:#0E1B24;font-size:14px;line-height:1.5">' +
        '<h2 style="color:#00476A;margin:0 0 8px">Recibimos tu solicitud ' + folio + '</h2>' +
        '<p>Hola ' + esc(String(get('Nombre')).split(' ')[0]) + ', gracias por cotizar con Tritic. Revisaremos tus modelos y te confirmaremos precio y fecha de entrega.</p>' +
        tabla + '<p>Total estimado con IVA: <b>' + mxn(cot.total) + '</b> · Entrega ' + esc(cot.entrega || '') + '</p>' +
        '<p style="color:#5A6973;font-size:12px">Cotización generada automáticamente; el precio final se confirma tras la revisión técnica del archivo.</p>' + wa + '</div>'
    });
  }

  sh.getRange(fila, C.Estado).setValue('Nueva solicitud');
  if (CFG.WHATSAPP_API.activo) { try { avisarWhatsApp(folio, get('Nombre'), mxn(cot.total)); } catch (err) { console.error(err); } }
  return { ok: true, folio };
}

// ---------- WhatsApp Cloud API (opcional) ----------
function avisarWhatsApp(folio, cliente, total) {
  const w = CFG.WHATSAPP_API;
  UrlFetchApp.fetch('https://graph.facebook.com/v20.0/' + w.phoneNumberId + '/messages', {
    method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + w.token }, muteHttpExceptions: true,
    payload: JSON.stringify({
      messaging_product: 'whatsapp', to: w.destino, type: 'template',
      template: { name: w.plantilla, language: { code: w.idioma }, components: [{ type: 'body', parameters: [folio, cliente, total].map((t) => ({ type: 'text', text: String(t) })) }] }
    })
  });
}

// ---------- Utilidades ----------
function salida(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function props() { return PropertiesService.getScriptProperties(); }
function hoja() {
  const id = props().getProperty('HOJA_ID');
  if (!id) throw new Error('El servidor no está configurado. Ejecuta configurar().');
  return SpreadsheetApp.openById(id).getSheets()[0];
}
function raiz() { return DriveApp.getFolderById(props().getProperty('CARPETA_ID')); }
function formatoFolio(n) { return CFG.PREFIJO + String(n).padStart(CFG.DIGITOS, '0'); }
function siguienteFolio() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const p = props();
    const n = Number(p.getProperty('CONTADOR') || CFG.FOLIO_INICIAL - 1) + 1;
    p.setProperty('CONTADOR', String(n));
    return formatoFolio(n);
  } finally { lock.releaseLock(); }
}
function buscar(folio) {
  const r = hoja().getRange('A:A').createTextFinder(String(folio)).matchEntireCell(true).findNext();
  return r ? r.getRow() : null;
}
function valor(fila, col) { return hoja().getRange(fila, C[col]).getValue(); }
function autorizar(d) {
  const fila = d.folio ? buscar(d.folio) : null;
  if (!fila || valor(fila, 'Token') !== d.token) throw new Error('Solicitud no autorizada.');
  return fila;
}
function carpetaDe(fila) {
  const url = String(valor(fila, 'Carpeta'));
  const m = url.match(/folders\/([\w-]+)/);
  if (!m) throw new Error('La solicitud no tiene carpeta.');
  return DriveApp.getFolderById(m[1]);
}
function validarCotizacion(cot) {
  if (!cot || !Array.isArray(cot.lineas) || !cot.lineas.length) throw new Error('Cotización vacía.');
  if (cot.lineas.length > 50) throw new Error('Demasiadas piezas en una sola solicitud.');
}
function llenarCotizacion(f, cot) {
  f[C.Piezas - 1] = Number(cot.piezas) || 0;
  f[C.Subtotal - 1] = Number(cot.subtotal) || 0;
  f[C.Total - 1] = Number(cot.total) || 0;
  f[C.Entrega - 1] = limpio(cot.entrega);
  f[C.Detalle - 1] = JSON.stringify(cot).slice(0, 49000);
}
function limpio(s) { return String(s == null ? '' : s).trim(); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function tablaHtml(lineas) {
  const th = 'style="text-align:left;padding:6px 8px;border-top:1px solid #5A6973;border-bottom:1px solid #5A6973;font-size:13px"';
  const td = 'style="padding:6px 8px;border-bottom:1px solid #D5DDE1;font-size:13px;vertical-align:top"';
  const tdn = 'style="padding:6px 8px;border-bottom:1px solid #D5DDE1;font-size:13px;text-align:right;font-family:Consolas,monospace;white-space:nowrap"';
  const mxn = (v) => v == null ? 'Manual' : '$' + Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return '<table style="border-collapse:collapse;width:100%;margin:12px 0"><thead><tr>' +
    ['Pieza', 'Especificación', 'Cant.', 'P. unitario', 'Importe'].map((h) => '<th ' + th + '>' + h + '</th>').join('') + '</tr></thead><tbody>' +
    lineas.map((l) => '<tr><td ' + td + '><b>' + esc(l.archivo) + '</b><br><span style="color:#5A6973">' + esc(l.medidas) + '</span></td>' +
      '<td ' + td + '>' + esc(l.tecnologia + ' ' + l.material + ', ' + l.color) + '<br><span style="color:#5A6973">' + esc(l.calidad + ' · relleno ' + l.relleno + ' · ' + l.acabado + ' · orientación ' + l.orientacion) + '</span></td>' +
      '<td ' + tdn + '>' + esc(l.cantidad) + '</td><td ' + tdn + '>' + mxn(l.unitario) + '</td><td ' + tdn + '>' + mxn(l.importe) + '</td></tr>').join('') +
    '</tbody></table>';
}
