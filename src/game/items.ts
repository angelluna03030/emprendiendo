import { makeItemMesh } from './models'
import type { BuyKind, Item, ItemData, ItemKind, Product } from './types'

export const CATALOG: Record<BuyKind, { label: string; cost: number }> = {
  aluminio: { label: 'Panel de aluminio', cost: 20 },
  placa: { label: 'Placa base', cost: 40 },
  cpu: { label: 'Procesador', cost: 60 },
  panel_solar: { label: 'Panel solar', cost: 30 },
  bateria: { label: 'Batería', cost: 30 },
  kit_celular: { label: 'Kit Celular x10', cost: 60 },
  kit_tablet: { label: 'Kit Tablet x10', cost: 80 },
  kit_laptop: { label: 'Kit Laptop x10', cost: 120 },
  obleas: { label: 'Obleas de silicio', cost: 25 },
  chasis: { label: 'Chasis PC', cost: 40 },
  ram16: { label: 'RAM 16 GB', cost: 30 },
  ram32: { label: 'RAM 32 GB', cost: 55 },
  ssd512: { label: 'SSD 512 GB', cost: 30 },
  ssd1tb: { label: 'SSD 1 TB', cost: 50 },
}

export const PRODUCT_LABEL: Record<Product, string> = { celular: 'Celular', tablet: 'Tablet', laptop: 'Laptop' }
export const PRODUCT_PLURAL: Record<Product, string> = { celular: 'Celulares', tablet: 'Tablets', laptop: 'Laptops' }

export function specLabel(ram: 16 | 32, ssd: 512 | 1024) {
  return `${ram} GB RAM · ${ssd === 1024 ? '1 TB' : '512 GB'}`
}

export function itemLabel(kind: ItemKind, data: ItemData): string {
  if (kind === 'lote') return `Lote: ${data.count ?? 0} ${PRODUCT_PLURAL[data.product ?? 'celular']}`
  if (kind === 'pc') return `PC ${specLabel(data.ram ?? 16, data.ssd ?? 512)}${data.verified ? ' ✓' : ''}`
  return CATALOG[kind].label
}

export function makeItem(kind: ItemKind, data: ItemData = {}): Item {
  return { kind, data, label: itemLabel(kind, data), mesh: makeItemMesh(kind, data) }
}
