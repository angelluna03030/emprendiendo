import type { Level, LevelId } from '../types'
import { ProjectLevel } from './level1-project'
import { BatchLevel } from './level2-batch'
import { ContinuousLevel } from './level3-continuous'
import { OrderLevel } from './level4-order'

export function createLevel(id: LevelId): Level {
  switch (id) {
    case 1:
      return new ProjectLevel()
    case 2:
      return new BatchLevel()
    case 3:
      return new ContinuousLevel()
    case 4:
      return new OrderLevel()
  }
}

export interface LevelInfo {
  id: LevelId
  emoji: string
  type: string
  title: string
  color: string
  concept: string
  /** Recorrido del material, de la entrada al cliente. */
  flow: string[]
  steps: string[]
  digital: string
  minScore: number
}

export const LEVELS: LevelInfo[] = [
  {
    id: 1,
    emoji: '🛰️',
    type: 'Producción por proyecto',
    title: 'Satélite a la medida',
    color: '#f59e0b',
    concept:
      'Se fabrica UN solo producto grande y único, en un lugar fijo, siguiendo etapas en orden y con fecha límite. Los materiales se llevan hasta el producto.',
    flow: ['🗄️ Estanterías', '🛰️ Plataforma', '💻 Terminal', '🛰️ Plataforma', '🚀 Cliente'],
    steps: [
      'Compra en las estanterías SOLO las piezas de la etapa actual (mira la lista de la izquierda).',
      'Llévalas a la plataforma del centro y presiona E para instalarlas.',
      'Cuando estén todas, mantén E en la plataforma para ensamblar la etapa.',
      'Etapa Software: ve a la terminal 💻 (derecha) y mantén E. Luego haz las pruebas y entrega el satélite antes de 2:30.',
    ],
    digital: 'Terminal de programación, seguimiento del avance del proyecto y dron de carga.',
    minScore: 50,
  },
  {
    id: 2,
    emoji: '📦',
    type: 'Producción por lotes',
    title: 'Línea de dispositivos',
    color: '#3b82f6',
    concept:
      'Se fabrica una cantidad fija de un mismo producto (un lote) y luego se cambia la máquina para el siguiente producto. Cada cambio de formato detiene la máquina un rato.',
    flow: ['🗄️ Kit', '⚙️ Ensambladora', '📥 Salida', '🚚 Despacho'],
    steps: [
      'Lote 1: 10 celulares → Lote 2: 20 tablets → Lote 3: 30 laptops.',
      'Cada kit trae material para 10 unidades: cárgalo en la ensambladora con E.',
      'Cuando termine, empaca la salida (E) y llévala al despacho de la derecha.',
      'Antes del siguiente lote, cambia el producto en el panel 🎛. ¡Producir de más es desperdicio!',
    ],
    digital: 'Ensambladora automática con contador de unidades y panel de configuración.',
    minScore: 50,
  },
  {
    id: 3,
    emoji: '🔄',
    type: 'Producción continua',
    title: 'Fábrica de chips',
    color: '#10b981',
    concept:
      'La línea fabrica chips SOLA y SIN PARAR durante 2 minutos. Tú no fabricas nada a mano: tu trabajo es que la línea NUNCA se detenga. Se detiene si la tolva se queda vacía o si una máquina se daña.',
    flow: ['🟣 Obleas', '🥣 Tolva', '🖨️ Fotolitografía', '🧪 Grabado', '📦 Empaquetado', '💾 Chips'],
    steps: [
      'Mira la barra de la tolva (izquierda). Cada chip gasta materia prima.',
      'Cuando el sensor 📡 avise "materia prima baja", compra obleas en la estantería y llévalas a la tolva (E).',
      'Si una máquina echa humo 🔥, corre hacia ella y MANTÉN E hasta repararla.',
      'No llenes la tolva de más (se derrama = desperdicio). Meta: 60 chips. En la tienda (B) hay un robot que llena la tolva solo.',
    ],
    digital: 'Sensor de nivel con alerta automática, robot abastecedor y dashboard en vivo.',
    minScore: 70,
  },
  {
    id: 4,
    emoji: '🎯',
    type: 'Producción bajo pedido',
    title: 'PCs a la medida',
    color: '#a855f7',
    concept:
      'Cada cliente pide PCs con características específicas. Solo se fabrica lo que se pidió y exactamente como se pidió. Es una fábrica flexible: cambias de configuración al instante.',
    flow: ['📋 Pedido', '🗄️ Piezas', '🔧 Banco', '📱 QR', '🧑 Cliente'],
    steps: [
      'Lee los pedidos a la derecha de la pantalla (RAM y disco de cada PC).',
      'En un banco: coloca un chasis + la RAM + el SSD pedidos y mantén E para ensamblar.',
      'Verifica el PC en el escáner QR 📱 y entrégalo en el mostrador del cliente.',
      'Fabricar de más o con otra configuración resta puntos.',
      '🧟 Aquí llegan el TRIPLE de zombis y, al entregar los 3 pedidos, aparecen 2 JEFES FINALES 👑: derrótalos para ganar.',
    ],
    digital: 'Sistema de pedidos y verificación con código QR.',
    minScore: 60,
  },
]
