import { Check, LockKeyhole } from 'lucide-react';
import type { Catalog, Item } from '../../shared/types';
import { formatItemAffix } from '../../shared/item-affixes';

export function ItemImage({ item, className = '' }: { item: Pick<Item, 'slot' | 'family'>; className?: string }) {
  return <img className={`item-image ${className}`} src={`/art/fantasy/item-${item.slot}${item.slot === 'weapon' && item.family ? `-${item.family}` : ''}.png`} alt="" loading="lazy" />;
}
export default function ItemTile({ item, catalog, selected, equipped, onClick }: { item: Item; catalog: Catalog; selected?: boolean; equipped?: boolean; onClick: () => void }) {
  return <button className={`item-tile rarity-${item.rarity} ${selected ? 'selected' : ''}`} onClick={onClick}>
    <div className="item-art"><ItemImage item={item} />{equipped && <span className="equipped-marker" title="Надето"><Check size={12} /></span>}{item.locked && <LockKeyhole className="locked-marker" size={12} />}</div>
    <div className="item-tile-copy"><span className="item-level">{catalog.slotNames[item.slot]} · ур. {item.level}</span><strong>{item.name}</strong><span className="item-affix">{item.affixes.length ? formatItemAffix(item, item.affixes[0]) : 'Без дополнительных свойств'}</span></div>
  </button>;
}
