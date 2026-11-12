# Prueba final: J7 Chat instalada

Esta guía es para probar a mano la app ya instalada, con teclas reales. Actualizada el 11 de noviembre de 2026. El paso 7 sigue en pausa por decisión del usuario; no ejecutarlo sin que lo retome. Si un paso no hace lo que dice "Tiene que…", anota el número del paso y lo que viste.

Antes de empezar, cierra cualquier J7 que esté abierta (menú del ícono → Salir de J7 Chat) y cualquier `npm run dev`.

## 1. Instalar

1. Abre el DMG de la versión recién compilada dentro de `release/` con doble clic.
2. Arrastra **J7 Chat** a la carpeta **Aplicaciones**. Si pregunta si quieres reemplazarla, di que sí.
3. Expulsa el disco "J7 Chat" del Finder.
4. Abre Aplicaciones, haz **clic derecho en J7 Chat → Abrir** y confirma con **Abrir**.
   - Si macOS no muestra el botón Abrir, ve a Ajustes del Sistema → Privacidad y seguridad, baja hasta el final y aprieta **Abrir igualmente**.
5. Tiene que aparecer el ícono de J7 en la barra de menús (arriba a la derecha), también en el Dock, y la barra abierta con el aviso "Aprieta ⌥ Espacio para abrir J7 desde cualquier app", que se va solo a los pocos segundos.
6. Cierra la barra con `Esc` y vuelve a abrirla con `⌥ Espacio`. Tiene que abrirse sin el aviso: el aviso sale una sola vez.

## 2. Permisos

1. Aprieta `⌘ ,` con la barra abierta. Tiene que abrirse la ventana "Ajustes de J7 Chat".
2. Ve a la sección **Permisos**.
3. Junto a **Grabación de pantalla**, aprieta **Abrir Ajustes del Sistema** y activa **J7 Chat** en la lista. Si macOS lo pide, deja que cierre y vuelva a abrir J7.
4. Vuelve a Ajustes de J7 → Permisos y haz lo mismo con **Monitoreo de entrada**.
5. Aprieta **Volver a comprobar**. Tiene que decir **Concedido** en los dos.

> Ojo: el permiso es para **J7 Chat**, no para T3 Code ni la terminal (eso era solo en desarrollo).

## 3. Una pregunta con cada programa

1. Abre la barra con `⌥ Espacio`, aprieta `⌘ N` para un chat nuevo y elige un modelo de **Claude** en el selector de modelo.
2. Pregunta: `¿Cuánto es 17 × 23? Responde solo el número.` Tiene que responder 391, con la etiqueta del modelo de Claude.
3. `⌘ N`, elige un modelo **GPT** y repite la pregunta. Tiene que responder 391 con la etiqueta de GPT.
4. `⌘ N`, elige un modelo de **Zen** (OpenCode) y repite. Tiene que responder 391, o mostrar un aviso claro de límite de cuota (eso es normal en Zen gratis y no es un error de J7).
5. Abre Ajustes → **Conexiones**. Los servicios con sesión deben mostrar **Conectado**, su versión y sus modelos; Hex aparece en **Voz** con estado **Listo** si está abierto.

## 4. Ajustes

1. En Ajustes → **Atajos**, haz clic en el botón de **Abrir barra** y aprieta `⌥ K`. Tiene que mostrar `⌥ K` y "Guardado".
2. Ve a Safari, aprieta `⌥ K`. Tiene que abrirse la barra.
3. Cierra la barra y aprieta `⌥ Espacio`. Tiene que **no** pasar nada (en Safari quizás escribe un carácter raro, eso está bien).
4. Haz clic en el ícono de J7 de la barra de menús. Tiene que mostrar `⌥ K` junto a "Abrir J7 Chat".
5. Intenta poner `⌥ ⇧ J` en **Abrir barra** (es el mismo de Captura y pregunta). Tiene que intercambiar las dos combinaciones: Abrir barra usa `⌥ ⇧ J` y Captura y pregunta usa la combinación anterior de Abrir barra. Comprueba ambos atajos; después restaura los predeterminados.
6. Aprieta **Restaurar atajos predeterminados**. Tiene que volver a `⌥ Espacio`, y `⌥ Espacio` tiene que abrir la barra otra vez.
7. Ve a **Instrucciones** y escribe: `Responde siempre en inglés.` Tiene que decir "Guardado" y el contador de caracteres.
8. Abre la barra, `⌘ N` y pregunta `¿De qué color es el cielo?` con cualquier modelo. Tiene que responder en inglés.
9. Borra las instrucciones. Tiene que decir "Guardado" otra vez.
10. Ve a **General**, cambia el tema a **Claro** y después a **Oscuro**, con la barra abierta al lado. Tiene que cambiar en vivo, sin reiniciar. Déjalo en **Sistema** al terminar.

## 5. Captura y voz

1. **`⌥ ⇧ J` con un PDF.**
   - Abre un PDF en Vista Previa y aprieta `⌥ ⇧ J`. Tiene que aparecer J7 con la pantalla completa adjunta, sin J7 en la captura.
   - Repite con J7 visible y 📌 activado. Tiene que no aparecer J7 en la captura.
   - Si tienes dos monitores, deja el mouse en el otro y repite. Tiene que capturar el monitor donde está el mouse.
2. **Preguntar en voz alta.** Mantén `⌥` derecho, espera a ver "● Escuchando…", pregunta algo sobre el PDF y suelta. Tiene que aparecer "Transcribiendo…" y el mensaje tiene que enviarse solo.
3. **Soltar sin hablar.** Mantén `⌥` derecho y suelta sin decir nada. Tiene que aparecer "No se escuchó nada" por 2 segundos, sin enviar nada, y la captura tiene que seguir adjunta.
4. **`⌥ 2` en otra app.**
   - En Notas, escribe `@` con `⌥ 2` rápido. Tiene que no pasar nada en J7.
   - Mantén `⌥` derecho, espera a ver "Escuchando…" y aprieta 2. Tiene que detenerse, quitar la captura y esconder J7.
5. **Dictado largo.**
   - Mantén `⌥` derecho y habla unos 60 segundos.
   - Al soltar, desde los 3 segundos tiene que aparecer "Transcribiendo… N s".
   - A la mitad, esconde la barra con `⌥ Espacio` y vuelve a abrirla. Tiene que haberse enviado el mensaje igual.
6. **Hex cerrado.** Cierra Hex desde su menú y mantén `⌥` derecho. Tiene que aparecer "Abriendo Hex…" y después empezar a grabar.
7. **Historial de Hex.** Después del paso 2, corre en la Terminal:

   ```
   /Applications/Hex.app/Contents/MacOS/hex history --limit 1 --json
   ```

   El `final_text` tiene que ser lo que dictaste.

## 6. Historial

1. Abre la barra y aprieta `⌘ B`. Tiene que abrirse el panel del historial a la izquierda, sin que el campo de texto se mueva.
2. Aprieta `⌘ B` otra vez. Tiene que cerrarse.
3. Aprieta `⌘ F`. Tiene que abrirse el historial con el cursor en el buscador.
4. Escribe `391`. Tiene que aparecer el chat del paso 3.1, con el texto encontrado resaltado.
5. Cierra el historial, arrastra la barra hasta pegarla al borde **izquierdo** de la pantalla y aprieta `⌘ B`. Tiene que verse el panel completo, sin quedar cortado por el borde.
6. Mira los títulos de los chats en el historial. Tienen que estar en el idioma de la pregunta y sin comillas ni punto final.

## 7. Salir mientras transcribe — en pausa

**No ejecutar por ahora.** El usuario dejó esta prueba física en pausa. Los tests de cierre no sustituyen esta comprobación con Hex real.


1. Abre la barra, mantén `⌥` derecho, di una frase larga y suelta.
2. Apenas aparezca "Transcribiendo…", haz clic en la barra y aprieta `⌘ Q` (o menú del ícono → Salir de J7 Chat).
3. Tiene que cerrarse en menos de 3 segundos y desaparecer el ícono de la barra de menús.
4. En la Terminal corre:

   ```
   ps aux | grep -E "J7 Chat|j7-helper|app-server" | grep -v grep
   ```

   Tiene que no salir ninguna línea de J7.
5. Abre Hex y mira su menú. Tiene que **no** estar grabando.

## 8. Arranque al iniciar sesión

1. Abre Ajustes del Sistema → General → **Ítems de inicio y extensiones**. Tiene que aparecer **J7 Chat** una sola vez. Si aparece repetida (por versiones de prueba anteriores), quita las que sobran y deja la de Aplicaciones.
2. Cierra sesión (menú  → Cerrar sesión) y vuelve a entrar.
3. Tiene que estar el ícono de J7 en la barra de menús sin que la hayas abierto, y `⌥ Espacio` tiene que abrir la barra.
4. En Ajustes de J7 → General, desactiva **Arrancar al iniciar sesión**, cierra sesión y vuelve a entrar. Tiene que **no** arrancar J7.
5. Ábrela desde Aplicaciones y vuelve a activar **Arrancar al iniciar sesión**. Tiene que quedar marcado.

## 9. Word y PowerPoint

1. Adjunta un `.docx` con párrafos y una tabla y un `.pptx` con varias diapositivas. La ficha debe avisar que J7 usa solo texto.
2. Pregunta por una frase de Word y por el contenido de una diapositiva. La respuesta debe poder usar el texto; no esperar lectura de imágenes o gráficos.
3. Cierra y reabre J7, abre el chat desde el historial y comprueba que los adjuntos siguen abriéndose aunque hayas movido el original.
4. Prueba un documento sin texto o con contraseña: debe mostrar un error claro y permitir seguir usando el chat. Un documento que exceda el límite de texto debe avisar del recorte.

## 10. Comparar

1. Activa **Comparar**, elige dos modelos y aplica la selección. Envía una pregunta: debe verse una sola pregunta y dos respuestas en columnas con el modelo identificado.
2. Prueba con tres modelos. En la barra estrecha, desplaza las columnas horizontalmente para leerlas; cada una debe conservar su copia y su estado.
3. Detén una comparación en curso: deben detenerse todas las respuestas, incluidas las que esperan la cola del mismo programa.
4. Abre otro chat y vuelve al anterior desde el historial; luego reinicia J7 y repite. La comparación debe mantener selección y agrupación.
5. Vuelve a **Chat normal** y comprueba que enviar una pregunta produce una sola respuesta. **Preguntar a otro modelo…** debe seguir funcionando.
6. Si comparas con servicios reales, cada modelo consume un turno de su cuota. La prueba automática usa modelos simulados.

## 11. Parche y datos locales

1. En **Conexiones**, comprueba cuenta, plan, versión y modelos, el enlace permanente Sitio oficial y que Descargar e Iniciar sesión aparecen según el estado. Prueba login, código, cancelación y timeout con fixtures; no cierres sesiones reales durante el desarrollo.
2. En una ejecución de desarrollo con `J7_MOCK=1`, Conexiones debe identificar los proveedores simulados sin mostrar falsos errores de Claude o Codex.
3. Abre Finder → Ir → Ir a la carpeta… y pega `~/Library/Application Support/J7 Chat`: `j7.db` contiene el historial y `attachments/` las copias. No moverlos con J7 abierta.
4. Prueba `⌘ ,` desde el campo de texto de la barra. Se agregó un manejo en el proceso principal; la prueba física previa que falló solo se cierra cuando este paso se compruebe con teclado real.
