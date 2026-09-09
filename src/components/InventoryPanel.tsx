import { useEffect, useRef, useState } from 'react';
import { Backpack, Check, ChevronDown, Layers3, ListChecks, LockKeyhole, Search, Trash2, X } from 'lucide-react';
import { itemProtection, salvageValue } from '../../shared/equipment';
import type { GameCommand, GameView, Item, Slot } from '../../shared/types';
import CollapsibleSection from './CollapsibleSection';
import GameDialog from './GameDialog';
import ItemTile from './ItemCard';

export default function InventoryPanel({ view, command, busy, inspect }: { view: GameView; command: (command: GameCommand) => Promise<boolean>; busy: boolean; inspect: (item: Item) => void }) {
  const [filter, setFilter] = useState<Slot | 'all'>('all');
  const [rarity, setRarity] = useState('all');
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(60);
  const [choosing, setChoosing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState<string[] | null>(null);
  const [notice, setNotice] = useState('');
  const [working, setWorking] = useState(false);
  const processing = useRef(false);
  useEffect(() => setVisible(60), [filter, rarity, search]);
  const items = [...view.state.inventory].reverse().filter(item => (filter === 'all' || item.slot === filter) && (rarity === 'all' || item.rarity === rarity) && item.name.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru')));
  const eligible = view.state.inventory.filter(item => !itemProtection(view.state, item));
  const eligibleIds = new Set(eligible.map(item => item.id));
  const selection = selected.filter(id => eligibleIds.has(id));
  const confirmedItems = confirmation?.map(id => view.state.inventory.find(item => item.id === id)).filter((item): item is Item => !!item) ?? [];
  const changed = confirmation !== null && (confirmedItems.length !== confirmation.length || confirmedItems.some(item => !eligibleIds.has(item.id)));
  const salvage = confirmedItems.reduce((sum, item) => sum + salvageValue(item), 0);
  const build = view.state.pendingBuild ?? view.state.build;
  return <CollapsibleSection id="inventory" title="Рюкзак" className="inventory" meta={`${view.state.inventory.length} предметов`}>
    <div className="inventory-filters"><label className="search"><Search size={15} /><input aria-label="Поиск предмета" placeholder="Найти предмет" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <select aria-label="Фильтр по слоту" value={filter} onChange={event => setFilter(event.target.value as Slot | 'all')}><option value="all">Все слоты</option>{view.catalog.slots.map(slot => <option value={slot} key={slot}>{view.catalog.slotNames[slot]}</option>)}</select>
      <select aria-label="Фильтр по редкости" value={rarity} onChange={event => setRarity(event.target.value)}><option value="all">Все редкости</option>{Object.entries(view.catalog.rarityNames).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select>
    </div>
    <div className="inventory-tools">
      <button className="button secondary" aria-pressed={choosing} onClick={() => { setChoosing(!choosing); setSelected([]); }}><ListChecks size={16} />{choosing ? 'Отменить выбор' : 'Выбрать'}</button>
      <button className="button secondary" disabled={busy || !eligible.length} onClick={() => setConfirmation(eligible.map(item => item.id))}><Trash2 size={16} />Разобрать все <span>{eligible.length}</span></button>
      {choosing && <button className="text-button" disabled={busy} onClick={() => setSelected(items.filter(item => eligibleIds.has(item.id)).map(item => item.id))}><Check size={16} />Выбрать по фильтру</button>}
    </div>
    {notice && <p className="inventory-notice" role="status">{notice}<button className="icon-button" aria-label="Скрыть результат разбора" onClick={() => setNotice('')}><X size={14} /></button></p>}
    <div className="inventory-grid">{items.slice(0, visible).map(item => {
      const protection = itemProtection(view.state, item);
      return <div className={`inventory-entry ${selection.includes(item.id) ? 'marked' : ''}`} key={item.id}>
        {choosing && <label className="item-select"><input type="checkbox" aria-label={`Выбрать ${item.name}`} checked={selection.includes(item.id)} disabled={busy || !!protection} onChange={event => setSelected(event.target.checked ? [...selection, item.id] : selection.filter(id => id !== item.id))} /><span className="sr-only">{item.name}</span></label>}
        <ItemTile item={item} catalog={view.catalog} equipped={Object.values(build.equipment).includes(item.id)} onClick={() => inspect(item)} />
        {protection && <small className="item-protection"><LockKeyhole size={11} />{protection}</small>}
      </div>;
    })}</div>
    {items.length > visible && <button className="text-button" onClick={() => setVisible(visible + 60)}>Показать ещё <ChevronDown size={15} /></button>}
    {!items.length && <div className="empty-state"><Backpack size={28} /><p>Таких предметов пока нет</p><button className="text-button" onClick={() => { setFilter('all'); setRarity('all'); setSearch(''); }}>Сбросить фильтры</button></div>}
    {choosing && <div className="salvage-selection"><span>Выбрано: <b>{selection.length}</b></span><button className="button danger" disabled={busy || !selection.length} onClick={() => setConfirmation(selection)}><Trash2 size={16} />Разобрать выбранные</button></div>}
    {confirmation && <GameDialog title="Разобрать предметы" close={() => setConfirmation(null)} busy={busy || working} footer={<div className="salvage-confirm-actions"><button className="button secondary" disabled={busy || working} onClick={() => setConfirmation(null)}>Отмена</button><button className="button danger" disabled={busy || working || changed || !confirmedItems.length} onClick={async () => {
      if (processing.current) return;
      processing.current = true; setWorking(true);
      let processed = 0, earned = 0;
      try {
        for (let index = 0; index < confirmedItems.length; index += 100) {
          const batch = confirmedItems.slice(index, index + 100);
          if (!await command({ type: 'dismantle', itemIds: batch.map(item => item.id) })) {
            setConfirmation(confirmation.slice(processed));
            setNotice(`Разбор остановлен. Разобрано: ${processed}, материалов: ${earned}. Остальные предметы требуют повторной проверки.`);
            return;
          }
          processed += batch.length; earned += batch.reduce((sum, item) => sum + salvageValue(item), 0);
        }
        setConfirmation(null); setSelected([]); setChoosing(false); setNotice(`Разобрано: ${processed}. Получено материалов: ${earned}.`);
      } finally { processing.current = false; setWorking(false); }
    }}><Trash2 size={16} />Разобрать {confirmedItems.length}</button></div>}>
      <p className="salvage-warning">Эти предметы будут потеряны. Надетые вещи, сохранённые сборки и закреплённые предметы исключены.</p>
      <p className="salvage-reward"><Layers3 size={18} />Материалы: <b>+{salvage}</b></p>
      {changed && <p className="negative" role="alert">Список изменился. Закройте окно и выберите предметы снова.</p>}
      <ul className="salvage-items">{confirmedItems.map(item => <li key={item.id}><span>{item.name}<small>{view.catalog.rarityNames[item.rarity]} · ур. {item.level}</small></span><b>+{salvageValue(item)}</b></li>)}</ul>
    </GameDialog>}
  </CollapsibleSection>;
}
