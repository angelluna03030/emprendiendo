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
| `1`, `2`, `3` | Pistola, subfusil, escopeta |
| `Esc` | Pausa |

## Modo zombis

En todos los niveles llegan oleadas de zombis que te atacan, dañan máquinas (se reparan manteniendo `E`)
y roban materiales. Se puede apagar desde el menú. En la tienda hay torretas, robot guardián, robot reparador,
botiquín, armas y máquinas propias de cada nivel (dron de carga, ensambladora turbo, cambio rápido SMED,
robot abastecedor, máquinas de alta velocidad, brazo de ensamble automático).

La música de fondo es `src/assets/sonido.mp3` y se puede apagar desde el menú o la pausa.

## Modo cooperativo (hasta 3 jugadores)

Menú → **👥 Jugar en equipo** → *Crear sala* → copia el link (`?sala=CODIGO`) y envíalo. Quien abre el link
escribe su nombre y entra al lobby. El anfitrión elige el nivel y empieza.

- Conexión directa entre navegadores con [PeerJS](https://peerjs.com) (usa su servidor público gratuito solo para
  presentarse; no hay servidor propio). Funciona desplegado en Vercel.
- El navegador del anfitrión simula la partida: su pestaña debe quedar abierta y visible.
- Dinero y puntaje son del equipo. Con más jugadores: más zombis, jefes con más vida y más producción
  (más piezas, lotes más grandes, meta de chips mayor, pedidos más grandes).
- Algunas redes (colegios, universidades) bloquean conexiones P2P; si no conecta, prueben con datos móviles.

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
