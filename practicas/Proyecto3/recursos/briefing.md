# Proyecto 3 · Encargo del cliente

**Cliente:** un negocio de hostelería de Benidorm (lo elegís vosotros).
**Encargo:** «Queremos una web que se vea bien en el móvil, porque casi todos nuestros clientes son turistas que nos buscan paseando por la playa.
Que se entienda la carta, que se pueda reservar mesa y que podamos contar novedades (conciertos, menús especiales, cierre por vacaciones).»

## Requisitos del cliente
1. Portada con la propuesta del negocio, horario y un botón de reserva bien visible.
2. Carta por categorías con precios y alérgenos (Reglamento UE 1169/2011: 14 alérgenos de declaración obligatoria).
3. Novedades: al menos tres noticias con fecha.
4. Reserva de mesa: nombre, teléfono, correo, fecha, hora, comensales, observaciones y aceptación de la política de privacidad.
5. Contacto: dirección, cómo llegar, mapa de OpenStreetMap y teléfono que se pueda pulsar en el móvil.
6. Aviso legal y privacidad.
7. Debe funcionar bien en el móvil, cargar rápido y ser accesible.

## Requisitos técnicos (profesor)
- HTML5 semántico y válido · una única hoja externa · variables CSS · Flexbox y Grid · mobile first con al menos dos puntos de ruptura.
- Imágenes propias, libres (Unsplash, Pexels, Wikimedia Commons) o SVG hechos por vosotros, con su licencia citada en el LEEME.
- Sin frameworks CSS (Bootstrap, Tailwind…): el objetivo es aprender CSS.
- Git en equipo y publicación en GitHub Pages.

## Continuidad
- **UP4 (JSON):** la carta se guardará en `carta.json` y se pintará con `fetch` dentro de `#carta` (PR 4.3).
- **UP7 (RSS):** las novedades se publicarán en un canal RSS 2.0 (PR 7.1).
