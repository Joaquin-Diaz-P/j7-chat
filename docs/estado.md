# J7 Chat: estado de cada código

Solo lo actualiza Claude, al revisar cada etapa.

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
| 0 | Adaptador de Gemini | — | Fuera de la versión 1: Google rechaza Gemini CLI con cuenta individual. Ver ideas a futuro |
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
| 3 | G1 G2 G3 G4 G5 G6 G7 G8 G9 · E12 | ⬜ | |
| 4 | H1 H2 H3 H4 H5 H6 H7 | ⬜ | |
| 5 | I1 I2 I3 I4 I5 I6 I7 I8 I9 · B8 · B10 (`⌘ B`, `⌘ F`) | ⬜ | |
| 6 | A4 A5 · B10 (`⌘ ,`) · J1 J2 J3 J4 J5 J6 J7 · K1 K2 K3 · M4 | ⬜ | |

Al revisar cada etapa, su fila se divide en una línea por código, con su resultado.
