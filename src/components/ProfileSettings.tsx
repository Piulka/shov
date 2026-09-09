import { useEffect, useState } from 'react';
import { Check, Pencil, RotateCcw } from 'lucide-react';
import { useSocial } from '../social-api';

export default function ProfileSettings({ onSaved }: { onSaved: () => void }) {
  const social = useSocial('');
  const [name, setName] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (social.view && !dirty) setName(social.view.profile.name); }, [social.view?.profile.name, dirty]);
  return <section className="profile-settings"><h3>Имя героя</h3><form onSubmit={async event => { event.preventDefault(); if (await social.command({ type: 'profile', name: name.trim() })) { setDirty(false); setSaved(true); onSaved(); } }}>
    <label><span className="sr-only">Имя героя</span><input value={name} minLength={2} maxLength={24} required disabled={!social.view || social.busy} onChange={event => { setName(event.target.value); setDirty(true); setSaved(false); }} /></label>
    <button className="button secondary" disabled={!social.view || social.busy || social.unresolved || name.trim().length < 2 || !dirty}><Pencil size={15} />Сохранить имя</button>
  </form><p className="mechanic-note">Имя видно другим игрокам. Смена бесплатная и доступна на любом уровне.</p>
    {saved && <p className="positive" role="status"><Check size={14} />Имя сохранено</p>}
    {social.error && <p className="negative" role="alert">{social.error}</p>}
    {social.unresolved && <button className="text-button" onClick={() => void social.retry()}><RotateCcw size={15} />Проверить сохранение</button>}
  </section>;
}
