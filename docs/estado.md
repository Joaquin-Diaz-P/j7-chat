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
| 0 | Adaptador de OpenCode Zen | ⏸ | Código listo; el límite gratis diario estaba agotado (HTTP 429). Claude repite la prueba cuando se libere |
| 1a | B1 B3 B6 (`Esc`) B9 B10 (`⌘ N`, `⌘ .`) B11 · C2 C4 · E3 · M2 M3 M5 | ✅ | Comprobados con la app real (CDP y CoreGraphics) |
| 1a | B4 | ❌ | Guarda una posición sin que el usuario arrastre: el evento `moved` también se dispara con los `setBounds` del programa |
| 1a | B5 | ❌ | Al achicarse (`⌘ N`), la barra no vuelve a su posición de anclaje: queda donde la subió el crecimiento |
| 1a | A6 | ❌ | Con SIGTERM registra "shutdown", pero el proceso sigue vivo más de 5 s |
| 1a | A2 | ⏸ | "Ajustes…" muestra un aviso provisional hasta la etapa 6 (esperado) |
| 1a | A1 A3 B2 B6 (clic fuera) B7 B12 C1 (IME) | 🔍 | El código está bien; falta comprobarlo a mano: ícono, segunda instancia, vidrio, clic fuera, 📌, tema e IME |
| 1b | B10 (`⌘ ⇧ C`) · C3 · E1 E2 E5 E6 E7 E11 · L1 L2 L3 L4 · M1 | ⬜ | |
| 2 | C5 C6 · D1 D2 D3 D4 D5 D6 D7 · E4 E8 E9 E10 · F1 F2 F3 F4 F5 F6 F7 | ⬜ | |
| 3 | G1 G2 G3 G4 G5 G6 G7 G8 G9 · E12 | ⬜ | |
| 4 | H1 H2 H3 H4 H5 H6 H7 | ⬜ | |
| 5 | I1 I2 I3 I4 I5 I6 I7 I8 I9 · B8 · B10 (`⌘ B`, `⌘ F`) | ⬜ | |
| 6 | A4 A5 · B10 (`⌘ ,`) · J1 J2 J3 J4 J5 J6 J7 · K1 K2 K3 · M4 | ⬜ | |

Al revisar cada etapa, su fila se divide en una línea por código, con su resultado.
