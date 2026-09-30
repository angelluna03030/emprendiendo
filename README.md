# 🏭 Production Game · Tech Factory

Videojuego 3D (React + TypeScript + Three.js) para experimentar los cuatro tipos de producción.
Vista isométrica estilo *Overcooked*: controlas a un operario dentro de una fábrica de tecnología.

## Cómo ejecutarlo

```bash
bun install
bun run dev
```

Abre la URL que muestra la consola (por defecto `http://localhost:5173`).
En desarrollo puedes abrir un nivel directo con `?nivel=1` … `?nivel=4` (ese modo no guarda progreso).

## Controles

| Tecla | Acción |
| --- | --- |
| `W A S D` / flechas | Moverse |
| `E` / `Espacio` | Tomar, dejar, usar |
| Mantener `E` | Ensamblar, reparar, programar |
| `B` | Tienda (robots, máquinas, armas) |
| Mouse | Apuntar · clic = disparo · mantener = ráfaga |
| `1` … `7` | Pistola, subfusil, escopeta, rifle láser, lanzallamas, bazuca, minigun |
| `V` | Cambiar vista: desde arriba, 3ª persona o 1ª persona |
| `Esc` | Pausa |

## Modo zombis

En todos los niveles llegan oleadas de zombis (normales, corredores, voladores, explosivos y grandotes; jefes
finales en el nivel 4) que te atacan, dañan máquinas (se reparan manteniendo `E`) y roban materiales. Se puede
apagar desde el menú. El nivel 1 ocurre en una estación espacial.

La tienda (`B`) tiene 6 armas extra, mejoras del equipo (chaleco, botas turbo, nanobots, balas mejoradas,
gatillo rápido, imán de dinero), defensas (torretas, torre Tesla, minas, robot guardián, dron de combate,
botiquín), mejoras de negocio (proveedor mayorista, contrato premium, seguro antirrobo, robot reparador) y
máquinas propias de cada nivel (dron de carga, ensambladora turbo, cambio rápido SMED, robot abastecedor,
máquinas de alta velocidad, brazo de ensamble automático).

La música de fondo es `src/assets/sonido.mp3` y se puede apagar desde el menú o la pausa.

## Modo cooperativo (hasta 3 jugadores)

Menú → **👥 Jugar en equipo** → *Crear sala* → copia el link (`?sala=CODIGO`) y envíalo. Quien abre el link
escribe su nombre y entra al lobby. El anfitrión elige el nivel y empieza.

- Primero se intenta la conexión directa entre navegadores con [PeerJS](https://peerjs.com). Si la red la bloquea
  (datos móviles, wifi de colegio, otra casa), el juego usa automáticamente un **servidor de relevo MQTT público**
  (EMQX o HiveMQ, por WebSocket seguro), que funciona casi en cualquier red. No hay que configurar nada.
- En el lobby el invitado ve cómo quedó conectado: ⚡ directa o 🛰️ por servidor de relevo.
- El navegador del anfitrión simula la partida: su pestaña debe quedar abierta (puede estar en segundo plano).
- Para probar el relevo en un solo computador, agrega `&relay=1` al link de invitado.
- Dinero y puntaje son del equipo. Con más jugadores: más zombis, jefes con más vida y más producción
  (más piezas, lotes más grandes, meta de chips mayor, pedidos más grandes).
- Algunas redes (colegios, universidades) bloquean conexiones P2P; si no conecta, prueben con datos móviles.
- El link solo funciona para otras personas si el juego está **publicado** (por ejemplo en Vercel). Un link que
  empieza con `http://localhost` solo abre en tu propio computador.

### Opcional: servidor TURN propio

El relevo MQTT ya cubre las redes difíciles. Si además quieres que la conexión directa funcione en más redes,
puedes configurar un servidor TURN gratuito:

1. Crea una cuenta gratis en [Metered Open Relay](https://www.metered.ca/tools/openrelay/) y copia el usuario y la
   clave TURN de tu panel.
2. En Vercel → tu proyecto → **Settings → Environment Variables** agrega `VITE_TURN_URL`, `VITE_TURN_USERNAME` y
   `VITE_TURN_CREDENTIAL` (mira `.env.example`).
3. Vuelve a desplegar (Redeploy) para que el juego use las variables.

Las credenciales quedan visibles en el código del navegador; usa una cuenta gratuita solo para este juego.

## Ficha técnica

- **Nombre:** Production Game · Tech Factory
- **Integrantes:** _(completar)_
- **Herramienta:** HTML + JavaScript (React, TypeScript y Three.js)
- **Objetivo:** Administrar una fábrica de tecnología y cumplir pedidos con los cuatro sistemas de producción:
  producir correctamente → entregar → recibir dinero, evitando desperdicios y retrasos.

| Nivel | Tipo | Qué hace el jugador |
| --- | --- | --- |
| 1 · Satélite a la medida | Por proyecto | Construye un único satélite en 5 etapas (estructura, electrónica, energía, software, pruebas) con fecha límite de 2:30. |
| 2 · Línea de dispositivos | Por lotes | Fabrica 10 celulares, 20 tablets y 30 laptops. Entre lotes debe cambiar el formato de la máquina; producir de más es desperdicio. |
| 3 · Fábrica de chips | Continua | Mantiene una línea funcionando 2 minutos: abastece la tolva y repara máquinas; cada parada resta puntos. |
| 4 · PCs a la medida | Bajo pedido | Arma PCs con la RAM y el SSD exactos que pide cada cliente, los verifica con QR y los entrega a tiempo. |

**Tecnología digital incorporada:** sensor de nivel con alerta automática, robot abastecedor (automatización),
verificación con código QR, sistema de pedidos, dashboard de producción en vivo y base de datos local
(el progreso y los récords se guardan en `localStorage`, sin servidor).

**Puntuación:** +10 producto/etapa correcta · +20 pedido a tiempo · −10 desperdicio · −20 pedido incorrecto ·
−30 retraso · −10 parada de línea. Para ganar hay que superar los 4 niveles con el puntaje mínimo de cada uno.

**Reto adicional (fábrica flexible):** el nivel 4 permite cambiar de configuración de producto al instante,
en contraste con el cambio de formato lento del nivel 2.

## Estructura

```
src/
  game/
    Game.ts          Motor: escena, jugador, interacción, puntaje y dinero
    models.ts        Modelos low-poly hechos con geometrías de Three.js
    levels/          Un archivo por tipo de producción
    save.ts          Guardado en localStorage
  ui/                Menú, HUD, resultados y récords (React)
```
