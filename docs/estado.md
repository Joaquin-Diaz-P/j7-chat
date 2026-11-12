# J7 Chat: estado de cada código

Registro histórico de las etapas y verificación actual. Actualizado por la sesión principal a petición del usuario el 11 de noviembre de 2026.

| Símbolo | Significado |
|---|---|
| ⬜ | Pendiente |
| 🔨 | En construcción |
| ✅ | Comprobado |
| ❌ | Falló (con nota) |
| ⏸ | En pausa por una causa externa |

| Etapa | Códigos | Estado | Notas |
|---|---|---|---|
| 0 | Adaptador de Claude | ✅ | Bloqueo, instrucciones, imagen, PDF nativo, retomar, esfuerzo y web comprobados |
| 0 | Adaptador de Codex | ✅ | Igual que Claude, salvo PDF: va como texto extraído. Shell desactivado |
| 0 | Adaptador de Gemini | ✓ | Conectado mediante Antigravity CLI 1.5.6; Flash, imágenes, PDF como texto, continuidad y web validados. Ver [Antigravity](antigravity.md) |
| 0 | Adaptador de OpenCode Zen | ⏸ | Código listo. El límite gratis seguía agotado el 5 de noviembre (error de cuota en 1,4 s). El catálogo sí lista 8 modelos gratis |
| 1a | A1 A3 A6 · B1 B3 B4 B5 B6 B7 B9 B10 (`⌘ N`, `⌘ .`) B11 · C1 C2 C4 · E3 · M2 M3 M5 | ✅ | Comprobados con la app real (CDP y CoreGraphics). El revisor corrigió B4 |
| 1a | A2 | ⏸ | "Ajustes…" muestra un aviso provisional hasta la etapa 6 (esperado) |
| 1a | B2 B12 | ✅ | Probados a mano por el usuario: vidrio, cambio de tema, foco de vuelta a la app anterior y posición en cada monitor |
| 1b | B10 (`⌘ ⇧ C`) · C3 · E1 E2 E5 E6 E11 · L1 L4 · Claude real | ✅ | El revisor corrigió E6 (shiki no coloreaba por la CSP; ahora usa su motor de JavaScript) |
| 1b | E7 | ❌ | `$$…$$` y `\[…\]` en una sola línea se ven como fórmula en línea. Se corrige en la etapa 2 |
| 1b | L3 | ❌ | La animación corre solo la primera vez, no cada vez que aparece la barra. Se corrige en la etapa 2 |
| 1b | M1 | ❌ | Los mensajes de error de los proveedores están escritos directamente en `claude.ts` y `runtime.ts`. Se corrige en la etapa 2 (E4) |
| 1b | L2 | ✅ | Probado a mano por el usuario: el texto se lee sobre el vidrio |
| 1b | Riesgos | ❌ | Al arrancar, J7 espera a Claude sin tiempo límite, y salir durante el arranque deja el proceso de Claude vivo. Se corrige en la etapa 2 |
| 2 | C5 C6 · D1 D2 D3 D4 D5 D6 D7 · E4 E9 E10 · F1 F2 F3 F4 F5 F6 | ✅ | Con el mock y la app real. Traspaso real Claude Haiku → GPT‑6‑Luna comprobado. El revisor corrigió D3 |
| 2 | E7 · L3 · M1 · A6 (salir durante el arranque) · arranque sin bloqueo | ✅ | Correcciones de la etapa 1b comprobadas |
| 2 | E8 | ❌ | "Preguntar a otro modelo…" repite la pregunta del usuario. Se corrige en la etapa 3 |
| 2 | F7 | ❌ | `getStatus` no tiene tiempo límite; un programa colgado bloquea su cola. Se corrige en la etapa 3 |
| 2 | E4 (detalle) | ❌ | Un error `auth` de Zen mostraría el comando de inicio de sesión del mock. Se corrige en la etapa 3 |
| 3 | G1 G2 G3 G5 G6 G7 G8 G9 · E12 · E8 F7 E4 (correcciones) | ✅ | Con el mock y la app real. PDF real comprobado con Claude Haiku (nativo) y GPT‑6‑Luna (texto). El revisor corrigió G2 (pegar desde Finder) y el test intermitente |
| 3 | G4 | 🔍 | Prueba física del usuario: selección de zona real con ✂︎ |
| 3 | Pendientes menores | ⬜ | Avisar al modelo del recorte y quitar `.env` (etapa 4); adjuntos en SQLite y limpieza de copias huérfanas (etapa 5) |
| 4 | H3 H5 · G5 G7 (correcciones) | ✅ | Ayudante Swift comprobado (`--self-test`, reinicio tras `kill -9`, solo escucha). Formatos de Hex confirmados |
| 4 | H1 H2 H4 H6 H7 | 🔍 | El código está revisado y tiene tests. Falta la prueba física del usuario (docs/prueba-fisica-voz.md), después de la etapa 5. El revisor corrigió dos huecos en setup.ts |
| 4 | Riesgos del flujo de voz | ⬜ | Cuelgue al salir mientras transcribe, Hex grabando tras cancelar, recuperación con --oldest-first, aviso falso de Hex no instalado, regla de 5 min y mensaje engañoso. Se corrigen en la etapa 5 |
| 5 | I1 I2 I3 I4 I5 I6 I7 I8 I9 · B8 · B10 (`⌘ B`, `⌘ F`) | ✅ | Con el mock, cuatro reinicios y un `kill -9`. B8 medido con CoreGraphics. El revisor corrigió I3: Apple Intelligence respondía la pregunta en vez de dar un título |
| 5 | Adjuntos en SQLite y copias huérfanas · siete correcciones de voz | ✅ | Comprobados en la app y en el código |
| 5 | Pendientes menores | ⬜ | Título en el idioma de la pregunta y sin comillas, títulos de chats interrumpidos, error ERR_FILE_NOT_FOUND sin capturar y `stop` al salir durante `start`. Se corrigen en la etapa 6 |
| 6 | A5 · B10 (`⌘ ,`) · J1 J2 J4 J5 J6 J7 · K1 K2 K3 · M4 · correcciones de la etapa 5 | ✅ | Con la app empaquetada y en desarrollo. El revisor corrigió el idioma de los títulos, el registro de ítems de inicio en desarrollo y siete detalles más |
| 6 | A4 · J3 (el atajo viejo deja de funcionar) | 🔍 | Prueba física del usuario: docs/prueba-final.md, pasos 4 y 8 |
| 4 | H1 H2 H4 H6 H7 | 🔍 | Prueba física del usuario con la app instalada: docs/prueba-final.md, paso 5 |
| — | Pendientes técnicos | ✅ / 🔍 | Parche automático cerrado el 11 de noviembre; pendientes externos y físicos en `ideas-futuras.md`. Ver ampliación al final. |
| 8 | J6 J7 J8 | ✅ | Comprobados con la app real (CDP): sin programas abre en Conexiones con "Descargar" y comandos; con programas listos y sin Grabación de pantalla abre en Permisos; permisos de Hex leídos de `hex status`. El revisor corrigió la sección inicial y que un fallo del chequeo cerrara J7. Pendiente a mano: conceder un permiso y ver que cambia solo al volver |

Al revisar cada etapa, su fila se divide en una línea por código, con su resultado.

## Prueba física con la app firmada (5 de noviembre)

| Código | Estado | Notas |
|---|---|---|
| H1 H2 H4 H6 H7 (captura y voz) | ✅ | Probado por el usuario con la app instalada y firmada con "J7 Chat Local" |
| Zen gratis | ✅ | Funciona a través del servicio de OpenCode, con las herramientas en "ask" y rechazadas |
| H.1 (salir con ⌘ Q mientras transcribe) | ⏸ | En pausa, a pedido del usuario |
| B10 (`⌘ ,` en la barra) | ❌ | No funciona con el teclado real. Al usuario no le importa: usa el menú de la barra de menús |

## Ampliación del 11 de noviembre de 2026

| Código / alcance | Estado | Evidencia y límites |
|---|---|---|
| G10 · Word y PowerPoint | ✅ | 11 pruebas Office nuevas: Word/tablas, orden PPT, UTF-16, CRC/XML, límites, copia local, reinicio SQLite y texto enviado al modelo. Avisos de recorte en interfaz. Ampliado: imágenes incrustadas enviadas a modelos con visión y gráficos convertidos en tablas (2 pruebas nuevas, 13 en total). |
| E13 · Modo comparar | ✅ | Servicio probado con tres modelos, aislamiento, cola, cancelación, error aislado y reinicio SQLite. Recorrido Electron con dos columnas, reinicio y cancelación aprobado. Agrupación de mensajes en un recorrido. Movido al selector de modelos (ícono bajo la estrella); el recorrido lo comprueba. |
| Parche técnico | ✅ | Inicio Hex de 5 s normal/cierre acotado; intercambio de atajos con rollback; Conexiones/mock; plist sin permiso de micrófono sobrante. Tests automáticos aprobados. ⌘ , usa además un interceptor nativo con prueba unitaria; falta teclado físico. |
| Documentación y persistencia | ✅ | Ubicaciones verificadas en código y presencia de base/adjuntos en el Mac, sin leer contenidos personales. Ver `datos-locales.md`. |
| OpenRouter | ⬜ | Primera prioridad después; sin API keys en este trabajo. |
| Carpetas con contexto compartido | — | Solo idea futura; no se construye ahora. |
| Importar historial / memoria global | — | Fuera del alcance por decisión del usuario. |

Las filas anteriores son el registro de cada etapa; una corrección posterior no reescribe el resultado histórico. Zen gratis ya está probado (5 de noviembre). Notarización, prueba física H.1 pausada y comprobaciones manuales de permisos siguen pendientes como se detalla en `ideas-futuras.md`.

### Verificación del parche 0.1.2

- `npm run typecheck`: aprobado.
- `npm test`: 277 pruebas aprobadas en 36 archivos.
- `npm run build:helper` y `npm run build`: aprobados.
- `npx playwright test`: cuatro recorridos Electron aprobados (chat/adjuntos/historial, voz simulada, comparación con reinicio y controles de ventana).
- Pruebas con `J7_MOCK=1` y `J7_DATA_DIR` temporal, sin consumir cuotas reales ni modificar el historial personal.
- El paquete 0.1.2 se compiló antes de los cambios concurrentes de conexión Antigravity. Esa integración sigue en otro hilo y su validación no se atribuye a este parche.

- `npm run dist`: aprobado; versión 0.1.2, DMG de 120.140.101 bytes, firma local verificada con `codesign --verify --deep --strict`.
- Prueba de la app empaquetada con datos temporales: adjuntó un `.docx` y un `.pptx`, extrajo ambos textos y completó dos respuestas de comparación con esos contenidos. Aviso «Solo texto» visible.
- `Info.plist`: versión e identificador correctos, permiso de captura conservado y descripción de micrófono sobrante eliminada.
- Instalador generado en `release/J7 Chat-0.1.2-arm64.dmg`; SHA-256 `04ada915c0cc392ae8b0a513a89caf739363ffc2c6b3371fc5eaada767a38d6b`.
- No se reemplazó la app de `/Applications`, no se publicó una release y no se hicieron commits ni push.

### Conexión Antigravity completada (11 de noviembre)

Gemini ya se conecta por `agy acp` con la sesión local de Google. Se instaló Antigravity CLI 1.5.6, se validaron respuestas reales de Flash, imágenes, PDF como texto, continuidad y búsqueda web, y se recompiló e instaló J7 0.1.2 incluyendo esta integración. Typecheck y 278 pruebas pasaron. Detalles y límites de la comprobación del paquete: [Antigravity](antigravity.md).

### Ajustes posteriores al 0.1.2 (sin empaquetar)

- Word y PowerPoint: imágenes incrustadas marcadas como «[Imagen N]» y enviadas a los modelos con visión (hasta 20, caché en `<adjunto>.media/`); gráficos nativos convertidos en tablas de datos. Adjuntos antiguos se releen desde la copia local al enviarlos.
- Comparar: el botón fijo del compositor se reemplazó por un ícono en la barra lateral del selector, bajo la estrella de favoritos; el botón del modelo muestra «Comparar · N» mientras está activo.
- Verificación: `npm run typecheck`, `npm test` (299 pruebas) y `npx playwright test` (4 recorridos) aprobados. No se generó un nuevo DMG porque la integración de Gemini sigue en curso en el mismo árbol de trabajo.

### Versión 0.2.0 (11 de noviembre)

Reúne Gemini por Antigravity, Word y PowerPoint con imágenes y gráficos, Comparar en el selector, la pestaña Conexiones y el arreglo de la barra y Ajustes que se abrían juntas. Se corrigieron los 9 hallazgos de la revisión de ventanas y Conexiones. Además:

- OpenCode 2.x: Conexiones reconoce el nuevo formato de `opencode auth list` (una fila «… stored» por credencial). Antes lo mostraba como «Sin sesión».
- Cierre sin errores: los mensajes que llegan de una ventana que se está cerrando se ignoran. Antes salía el diálogo «Object has been destroyed» al salir de J7, sobre todo en las pruebas automáticas.
- Un solo proceso `j7-helper` atiende títulos, captura, voz y Ajustes. Antes había hasta tres. «Volver a la app anterior» funciona desde el arranque.
- Un servicio desactivado muestra «Desactivado» en lugar de «Modelos 0».
- Verificación: `npm run typecheck`, `npm test` (336 pruebas) y `npx playwright test` (4 recorridos) aprobados.
- Pendiente de comprobar a mano: iniciar y cerrar sesión de verdad desde Conexiones (Claude, Codex y Antigravity), y el foco al cerrar la barra con Ajustes abierto.
