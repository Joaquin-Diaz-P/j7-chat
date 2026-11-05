# Prueba física: captura y voz

Esta guía es para probar a mano los atajos de captura y voz (H1, H2, H4, H6 y H7), porque los atajos globales no se pueden simular de forma automática. Conviene hacerla **después de la etapa 5**, que trae correcciones del flujo de voz.

## 1. Permisos en desarrollo

macOS da los permisos a la app desde la que corres `npm run dev` (T3 Code o tu terminal), no a J7.

1. Abre Ajustes del Sistema → Privacidad y seguridad → **Grabación de pantalla y audio** y activa T3 Code (o tu terminal).
2. En **Monitoreo de entrada**, confirma que esté activada.
3. Cierra y vuelve a abrir esa app, y luego corre `npm run dev`.

## 2. Pruebas

1. **`⌥⇧J` con un PDF.**
   - Abre un PDF en Vista Previa y aprieta `⌥⇧J`. Tiene que aparecer J7 con la pantalla completa adjunta, sin J7 en la captura.
   - Repite con J7 visible y 📌 activado: J7 no debe aparecer en la captura.
   - Con dos monitores, deja el mouse en el otro y repite.
2. **Preguntar en voz alta.** Mantén `⌥` derecho, espera a ver "● Escuchando…", pregunta algo sobre el PDF y suelta. Tiene que aparecer "Transcribiendo…" y el mensaje tiene que enviarse solo.
3. **Soltar sin hablar.** Mantén `⌥` derecho y suelta sin decir nada. Tiene que aparecer "No se escuchó nada" por 2 segundos, sin enviar nada, y la captura tiene que seguir adjunta.
4. **`⌥ 2` en otra app.**
   - En Notas, escribe `@` con `⌥ 2` rápido: no tiene que pasar nada.
   - Mantén `⌥`, espera a ver "Escuchando…" y aprieta 2: tiene que detenerse, quitar la captura y esconder J7.
5. **Dictado largo.**
   - Mantén `⌥` derecho y habla unos 60 segundos.
   - Al soltar, desde los 3 segundos tiene que aparecer "Transcribiendo… N s".
   - A la mitad, esconde la barra con `⌥J` y vuelve a abrirla: el mensaje tiene que haberse enviado igual.
6. **Hex cerrado.** Cierra Hex desde su menú y mantén `⌥` derecho. Tiene que aparecer "Abriendo Hex…" y después empezar a grabar.
7. **Historial de Hex.** Después de la prueba 2, corre en la terminal:

   ```
   /Applications/Hex.app/Contents/MacOS/hex history --limit 1 --json
   ```

   El `final_text` tiene que ser lo que dictaste. Eso confirma que los dictados que recibe J7 también quedan en el historial de Hex, que es desde donde J7 recupera el texto si Hex se demora.
