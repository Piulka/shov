#!/usr/bin/env python3
"""Original, sample-free material sound design. Requires numpy, scipy and ffmpeg.
Rebuilds audio only; never touches graphics. 48 kHz / 24-bit PCM masters.
"""
import csv
import hashlib
import json
from pathlib import Path
import subprocess
import numpy as np
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/audio'
MASTERS = ROOT / 'assets/art-audio-v1/sources/audio-wav'
QA = ROOT / 'assets/art-audio-v1/qa'
SR = 48000
assets, measurements = [], []

def rng_for(name):
    return np.random.default_rng(int.from_bytes(hashlib.sha256(name.encode()).digest()[:8], 'little'))

def noise(n, rng, cutoff=1600):
    return sosfilt(butter(2, cutoff, fs=SR, output='sos'), rng.standard_normal(n))

def tone(t, freq, decay):
    return np.sin(2*np.pi*freq*t) * np.exp(-t/decay)

def effect(name, length, peak):
    rng = rng_for(name)
    t = np.arange(round(length*SR))/SR
    f = rng.uniform(260, 350)
    if 'glass' in name or 'cleanse' in name:
        x = sum(tone(t, f*k, .09/(i+1)**.3)/(i+1)**1.6 for i,k in enumerate([1, 2.71, 4.13]))
        x += .12*noise(len(t), rng)*np.exp(-t/.025)
    elif 'fabric' in name or 'salvage' in name:
        x = noise(len(t), rng, 1100)*np.exp(-t/.07) + .08*tone(t, 135, .08)
    elif 'needle' in name or 'dot' in name or 'lock' in name:
        x = tone(t, f*1.3, .035) + .25*tone(t, f*2.6, .024) + .15*noise(len(t), rng)*np.exp(-t/.025)
    elif 'windup' in name:
        x = (np.sin(2*np.pi*(95*t+35*t*t))*.5 + noise(len(t), rng, 650)*.35) * np.sin(np.pi*t/length)**1.3
    elif any(k in name for k in ['heal','shield','victory','confirm','levelup','routeunlock','craft','reforge','upgrade','drop']):
        x = sum(np.sin(2*np.pi*f*k*t)*np.exp(-np.maximum(0,t-i*.04)/.14)*(t>=i*.04)/(i+1) for i,k in enumerate([1,1.25,1.5]))
        x += .1*noise(len(t), rng, 700)*np.exp(-t/.08)
    elif 'retreat' in name or 'reject' in name or 'back' in name:
        x = np.sin(2*np.pi*(220*t-70*t*t))*np.exp(-t/.09) + .15*tone(t, 147, .08)
    else:
        x = tone(t, f, .035) + .35*tone(t, f*2.37, .019) + .45*noise(len(t), rng, 2300)*np.exp(-t/.016)
        if 'blade' in name: x += .15*tone(t, 650, .065)
        if 'heavy.impact' in name: x += 1.3*tone(t, 95, .11)
        if 'defeat' in name:
            for offset in [.09,.19,.32]:
                shift = round(offset*SR)
                if shift<len(t): x[shift:] += .4*noise(len(t)-shift, rng, 1000)*np.exp(-t[:-shift]/.06)
    # Smooth 2 ms onset retains contact; a 12 ms tail avoids cuts.
    x *= np.minimum(1,t/.002)*np.minimum(1,(length-t)/.012)
    return x/max(np.max(np.abs(x)),1e-9)*10**(peak/20)

def ambience(region, seconds=64):
    rng = rng_for(region)
    n = SR*seconds
    # Frequency-domain filtered periodic noise: genuinely periodic, no repeated fade.
    freqs = np.fft.rfftfreq(n, 1/SR)
    spectrum = rng.standard_normal(len(freqs)) + 1j*rng.standard_normal(len(freqs))
    profile = 1 / np.sqrt(np.maximum(freqs, 35)) / (1+(freqs/1100)**4)
    profile[freqs<35] = 0
    bed = np.fft.irfft(spectrum*profile, n=n)
    bed /= np.std(bed)
    t = np.arange(n)/SR
    bed *= .035*(.82+.18*np.sin(2*np.pi*3*t/seconds))
    layers = np.zeros(n)
    notes = {'terraces':[293.665,391.995,440], 'glassgarden':[329.628,493.883,587.33], 'carmine':[146.832,195.998,261.626]}[region]
    for i in range(13):
        at = int(rng.uniform(0,seconds)*SR)
        st = np.arange(SR*2)/SR
        drop = tone(st, notes[i%3], .16 if region!='carmine' else .28)
        drop *= np.minimum(1,st/.015)*.035
        np.add.at(layers,(at+np.arange(len(drop)))%n,drop)
    left = bed+layers
    right = .86*bed + .14*np.roll(bed,359) + np.roll(layers,71)
    stereo = np.stack([left,right],axis=1)
    # Conservative average level; exact loudness is measured below.
    return stereo * 10**(3.88/20)

def export(name, data, bus):
    relative = ('ambience/' + name.split('.')[-1]) if bus=='ambience' else ('sfx/' + name.removeprefix('sfx.').replace('.','-'))
    master = MASTERS / (relative+'.wav')
    master.parent.mkdir(parents=True, exist_ok=True)
    (OUT/relative).parent.mkdir(parents=True, exist_ok=True)
    channels = 1 if data.ndim==1 else data.shape[1]
    subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(SR),'-ac',str(channels),'-i','pipe:0','-c:a','pcm_s24le',str(master)],input=data.astype('<f4').tobytes(),check=True)
    for ext,codec,quality in [('ogg','libvorbis',['-q:a','3']),('m4a','aac',['-b:a','96k' if channels==2 else '64k'])]:
        subprocess.run(['ffmpeg','-v','error','-y','-i',str(master),'-c:a',codec,*quality,str(OUT/(relative+'.'+ext))],check=True)
    measurement = subprocess.run(['ffmpeg','-hide_banner','-i',str(master),'-af','loudnorm=I=-26:TP=-1:LRA=7:print_format=json','-f','null','-'],capture_output=True,text=True,check=True).stderr
    info = json.loads(measurement[measurement.rfind('{'):])
    entry = {'assetId':name,'bus':bus,'sources':[{'src':relative+'.ogg','type':'audio/ogg; codecs=vorbis'},{'src':relative+'.m4a','type':'audio/mp4'}], 'sampleRate':SR,'channels':channels,'duration':len(data)/SR,'gainDb':0,'measuredLufsI':info['input_i'],'measuredTruePeakDbtp':info['input_tp']}
    if bus=='ambience': entry['loop']={'startSample':0,'endSample':len(data)}
    assets.append(entry)
    measurements.append({'assetId':name,'seconds':len(data)/SR,'channels':channels,'peakDbfs':round(20*np.log10(np.max(np.abs(data))),2),'lufsI':info['input_i'],'truePeakDbtp':info['input_tp'],'pcmSeamDelta':round(float(np.max(np.abs(data[-1]-data[0]))),6) if bus=='ambience' else ''})

for region in ['terraces','glassgarden','carmine']: export('ambience.'+region,ambience(region),'ambience')
groups = {'attack.blade':(.26,-9,3),'attack.glass':(.34,-11,3),'attack.needle':(.23,-12,3),'hit.ceramic':(.18,-10,3),'hit.glass':(.24,-11,3),'hit.fabric':(.19,-12,3),'heavy.impact':(.45,-6,2),'shield.absorb':(.18,-13,2),'dot':(.13,-23,2)}
singles = {'heavy.windup':(2,-16),'shield.raise':(.38,-14),'heal':(.55,-15),'cleanse':(.38,-16),'critical':(.18,-15),'defeat.ceramic':(.7,-15),'defeat.glass':(.7,-16),'defeat.fabric':(.65,-17),'victory':(.6,-19),'retreat':(.5,-19),'ui.click':(.065,-27),'ui.back':(.08,-26),'ui.confirm':(.18,-23),'ui.reject':(.2,-22),'ui.equip':(.23,-21),'ui.lock':(.18,-23),'item.salvage':(.42,-21),'item.drop.common':(.2,-25),'item.drop.fine':(.35,-23),'item.drop.resonant':(.5,-21),'item.craft':(.6,-20),'item.reforge':(.55,-21),'item.upgrade':(.7,-20),'ui.levelup':(.9,-20),'ui.routeunlock':(1,-21)}
for group,(duration,peak,count) in groups.items():
    for i in range(1,count+1):
        name=f'sfx.{group}.{i:02}'
        export(name,effect(name,duration,peak),'sfx')
for group,(duration,peak) in singles.items():
    name='sfx.'+group
    export(name,effect(name,duration,peak),'sfx')
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'audio.json').write_text(json.dumps({'schema':'shov.audio.v1','revision':1,'assets':assets},indent=2)+'\n')
QA.mkdir(parents=True,exist_ok=True)
with (QA/'audio-measurements.csv').open('w') as f:
    writer=csv.DictWriter(f,fieldnames=measurements[0].keys());writer.writeheader();writer.writerows(measurements)
print(f'Exported {len(assets)} sounds, PCM masters, Ogg/AAC pairs, measured loudness.')
