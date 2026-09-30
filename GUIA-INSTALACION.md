# Cotizador 3D Tritic — Guía de instalación

El sistema tiene dos partes:

| Parte | Dónde vive | Qué hace |
| --- | --- | --- |
| Página del cotizador (`index.html` + lector STEP) | GitHub Pages, en un subdominio (p. ej. `cotizador.tritic.mx`) | Lee el modelo, lo orienta, calcula el precio y envía la solicitud |
| Servidor de solicitudes (`apps-script/Codigo.gs`) | Google Apps Script, en la cuenta de Google de Tritic | Asigna el folio `CTI-XXXX`, guarda los modelos en Drive, registra en una hoja y envía los correos |

Tiempo estimado: 30–40 minutos.

---

## 1. Servidor de solicitudes (Google Apps Script)

Usa la cuenta de Google desde la que quieres que salgan los correos y donde quieres guardar los modelos (de preferencia una cuenta de Google Workspace de Tritic).

1. Entra a <https://script.google.com> y crea un **Proyecto nuevo**. Nómbralo "Cotizador 3D Tritic".
2. Borra el contenido de `Código.gs` y pega todo el contenido de `apps-script/Codigo.gs`.
3. En el bloque `CFG`, al inicio, cambia como mínimo:
   - `EMAIL_EQUIPO`: el correo donde deben llegar las solicitudes (puedes poner varios separados por coma).
   - `FOLIO_INICIAL`: el primer número que se asignará. Con `1`, el primer folio será `CTI-0001`.
   - `WHATSAPP_EQUIPO` (opcional): el número de WhatsApp de Tritic, con lada país y sin `+` (p. ej. `526141234567`). Aparece como enlace en el correo de confirmación al cliente.
4. Guarda (Ctrl + S). En la barra superior selecciona la función **`configurar`** y pulsa **Ejecutar**.
   - Google pedirá permisos para Drive, Hojas de cálculo y Gmail. Acepta. Si aparece "Google no verificó esta app", entra a *Configuración avanzada → Ir a Cotizador 3D Tritic*. Es normal: el script es tuyo.
   - En el registro de ejecución verás las ligas de la carpeta **"Cotizaciones CTI · Cotizador 3D"** y de la hoja **"Registro de cotizaciones CTI"**, ya creadas en tu Drive.
5. Publica el servidor: **Implementar → Nueva implementación**.
   - Tipo: **Aplicación web**.
   - Ejecutar como: **Yo**.
   - Quién tiene acceso: **Cualquier usuario**. Es necesario para que los clientes puedan enviar sin iniciar sesión; el servidor solo acepta las acciones del cotizador.
   - Pulsa **Implementar** y copia la **URL de la aplicación web** (termina en `/exec`).
6. Prueba: abre esa URL en el navegador. Debe mostrar `{"ok":true,"servicio":"Cotizador Tritic","version":1}`.

**Si más adelante cambias el código:** ve a *Implementar → Administrar implementaciones → editar (lápiz) → Versión: nueva versión*. Así la URL no cambia.

### Límites de la cuenta de Google

| Concepto | Gmail gratuito | Google Workspace |
| --- | --- | --- |
| Correos por día (cada solicitud envía 2) | 100 | 1 500 |
| Tamaño máximo por archivo de modelo | 30 MB (configurable hasta ~35 MB) | igual |
| Modelos adjuntos al correo del equipo | Si en total pesan menos de 20 MB; si no, solo va la liga a Drive | igual |

---

## 2. Página del cotizador (GitHub Pages)

1. Abre `index.html` con un editor de texto y busca el bloque `CONFIG`. Llena:
   - `backend.url`: la URL `/exec` del paso 1.5.
   - `contacto.whatsapp`: el WhatsApp de Tritic, con lada país y sin `+` (p. ej. `526141234567`). Activa el botón "Avisar por WhatsApp" después de enviar.
   - Las tarifas (`materiales`, `acabados`, `descuentosCantidad`, `cargoPreparacion`, `pedidoMinimo`) y el volumen de impresión de tus máquinas (`tecnologias`).
2. Crea un repositorio nuevo (p. ej. `cotizador`) y sube estos archivos a la raíz:
   - `index.html`
   - `occt-import-js.js`
   - `occt-import-js.wasm`
   - `LICENSE-occt.txt` y `LICENSE-occt-import-js.txt` (licencias del lector STEP; deben acompañarlo)
   
   `apps-script/` y esta guía no se usan en GitHub Pages; se conservan como respaldo del código del servidor.
3. En el repositorio: **Settings → Pages → Source: Deploy from a branch → main / (root)**.
4. Subdominio: en **Custom domain** escribe `cotizador.tritic.mx` (o el que elijas) y activa **Enforce HTTPS**. En tu proveedor de DNS crea un registro `CNAME` de `cotizador` hacia `TU-USUARIO.github.io`, igual que en tus otros subdominios.
5. Abre `https://cotizador.tritic.mx`, sube un modelo y envía una solicitud de prueba. Verifica que:
   - Llega el correo al equipo, con los modelos.
   - Llega el acuse al correo del cliente.
   - Aparece la fila en la hoja y la carpeta `CTI-0001 · Nombre` en Drive.

---

## 3. Integración con el sitio de Wix

Recomendación: **enlace a la página completa** (opción A). Wix muestra los elementos incrustados dentro de un marco de tamaño fijo, lo que en celular corta el visor 3D y el panel de parámetros.

**Opción A — Botón o menú (recomendada)**
En el editor de Wix, agrega un botón "Cotizar en línea" o una entrada de menú con liga a `https://cotizador.tritic.mx`. Si quieres que se abra en la misma pestaña, elige *Abrir en: esta ventana*.

**Opción B — Incrustado en una página de Wix**
1. *Agregar → Insertar código → Insertar un sitio* (o "Embed a site").
2. URL: `https://cotizador.tritic.mx`.
3. Ajusta el marco al ancho completo y a unos 1 800 px de alto en escritorio. Revisa la vista móvil de Wix; si el marco queda corto, en móvil usa la opción A.

---

## 4. Cómo funciona el folio

- El folio `CTI-XXXX` es consecutivo y lo asigna el servidor, así que nunca se repite, aunque dos clientes coticen al mismo tiempo.
- Se asigna cuando el cliente **guarda la cotización en PDF** o **envía la solicitud**. Si solo mira precios, no se consume ningún folio.
- Si el cliente guarda el PDF y luego envía la misma cotización sin cambios, se conserva el mismo folio. Si cambia algo (material, cantidad, orientación…), la cotización nueva recibe otro folio.
- En la hoja, la columna **Estado** indica en qué quedó cada folio:
  - *PDF descargado*: el cliente guardó la cotización pero no la envió. Es un buen prospecto para dar seguimiento.
  - *Recibiendo archivos*: el envío se interrumpió.
  - *Nueva solicitud*: la solicitud llegó completa. Puedes cambiar este estado a mano ("En revisión", "Aprobada", "Entregada") para usar la hoja como tablero.
- Los folios `CT` manuales siguen siendo independientes; el prefijo `CTI` distingue las cotizaciones inmediatas.

---

## 5. WhatsApp

Tal como queda instalado:

- **Cliente → Tritic.** Al terminar el envío, el cliente ve el botón "Avisar por WhatsApp", que abre un chat con el número de Tritic y un mensaje prellenado con su nombre, folio y total. La conversación empieza desde el WhatsApp del cliente, así que ya tienes su número para dar seguimiento.
- **Correo de confirmación al cliente.** Incluye una liga para escribir a Tritic por WhatsApp citando el folio.

Aviso automático al WhatsApp del equipo por cada solicitud (opcional): WhatsApp solo lo permite mediante la **WhatsApp Cloud API de Meta**. El script ya trae la función lista (`CFG.WHATSAPP_API`), pero requiere:

1. Una cuenta de Meta Business verificada y un número dado de alta en WhatsApp Business Platform. Ese número no puede ser el mismo que usas en la app de WhatsApp Business.
2. Una **plantilla de mensaje aprobada** por Meta con tres variables: folio, cliente y total. Por ejemplo: *"Nueva solicitud {{1}} de {{2}} por {{3}}. Revisa tu correo."*
3. Un token de acceso permanente y el *Phone number ID*, que se capturan en `CFG.WHATSAPP_API`, con `activo: true`.

Meta cobra por conversación iniciada por la empresa (en México, unos centavos de dólar por mensaje de utilidad). Mientras no lo configures, el correo es el canal automático y el WhatsApp se inicia desde el cliente.

---

## 6. Orientación automática

- Al subir un modelo, el cotizador evalúa como apoyo sus caras planas más grandes y las seis direcciones principales.
- Para cada candidata estima soportes, altura y tiempo, y elige la orientación más económica que además tenga buena superficie de apoyo sobre la cama.
- El cliente ve el motivo (por ejemplo, *"Apoyada sobre una cara plana de 2 400 mm². No necesita soportes. 49 % más económica que como viene en el archivo."*).
- El cliente puede elegir la cara base haciendo clic sobre la pieza, o volver a la orientación del archivo.
- La orientación elegida llega en el correo y en la hoja (*sugerida*, *elegida por el cliente* o *la del archivo*), para que el equipo sepa si el cliente la cambió.
- Para piezas que trabajan a esfuerzo, el formulario invita al cliente a indicarlo en las notas: la orientación por resistencia no siempre coincide con la más económica.
