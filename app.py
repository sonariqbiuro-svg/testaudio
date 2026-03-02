"""
Sonariq Mastering Audio Analyzer — Flask Backend
Full analysis: LUFS, True Peak, Spectrum, Stereo, Dynamics, Key, QC, Crest, Waveform, Fade, Lossy, AI
"""
import os, sys, json, math, traceback, tempfile, gc
import numpy as np
from flask import Flask, render_template, request, jsonify, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(tempfile.gettempdir(), 'sonariq_uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
ALLOWED_EXTENSIONS = {'wav', 'mp3', 'flac', 'ogg', 'aiff'}

app = Flask(__name__)
CORS(app)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024 * 1024  # 2 GB for full albums

# ─── Sanitize ───
def sanitize_for_json(obj):
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_for_json(v) for v in obj]
    elif isinstance(obj, (np.integer,)):
        return int(obj)
    elif isinstance(obj, (np.floating,)):
        v = float(obj)
        if math.isnan(v): return None
        if math.isinf(v): return -99.0 if v < 0 else 99.0
        return v
    elif isinstance(obj, np.ndarray):
        return sanitize_for_json(obj.tolist())
    elif isinstance(obj, float):
        if math.isnan(obj): return None
        if math.isinf(obj): return -99.0 if obj < 0 else 99.0
        return obj
    elif isinstance(obj, np.bool_):
        return bool(obj)
    return obj

# ─── Music constants ───
NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
ALL_CHORD_NAMES = []
ALL_CHORD_TEMPLATES = []
for i in range(12):
    m = np.zeros(12); m[i]=1; m[(i+4)%12]=1; m[(i+7)%12]=1
    ALL_CHORD_TEMPLATES.append(m); ALL_CHORD_NAMES.append(NOTES[i]+'-dur')
    m = np.zeros(12); m[i]=1; m[(i+3)%12]=1; m[(i+7)%12]=1
    ALL_CHORD_TEMPLATES.append(m); ALL_CHORD_NAMES.append(NOTES[i]+'-moll')
ALL_CHORD_TEMPLATES = np.array(ALL_CHORD_TEMPLATES).T

def allowed_file(fn):
    return '.' in fn and fn.rsplit('.',1)[1].lower() in ALLOWED_EXTENSIONS

def decimate(data, times, max_pts=500):
    if len(data) <= max_pts: return list(data), list(times)
    step = max(1, len(data)//max_pts)
    return list(data[::step]), list(times[::step])

# ═══════════════════════════════════════════════════════════
#  Analysis functions
# ═══════════════════════════════════════════════════════════

def compute_lufs(y, sr):
    import warnings; warnings.filterwarnings('ignore')
    y_s = np.array([y,y]) if y.ndim==1 else y
    def rms2lufs(r):
        return -70.0 if r<1e-10 else 20.0*np.log10(r)-0.691
    integrated = rms2lufs(np.sqrt(np.mean(y_s**2)))
    w3=int(3*sr); hop1=int(sr)
    st=[]; st_t=[]
    for s in range(0,y_s.shape[-1]-w3,hop1):
        seg=y_s[...,s:s+w3]; st.append(float(max(rms2lufs(np.sqrt(np.mean(seg**2))),-70))); st_t.append(float(s/sr))
    w4=int(0.4*sr); hop2=int(0.1*sr)
    mom=[]; mom_t=[]
    for s in range(0,y_s.shape[-1]-w4,hop2):
        seg=y_s[...,s:s+w4]; mom.append(float(max(rms2lufs(np.sqrt(np.mean(seg**2))),-70))); mom_t.append(float(s/sr))
    lra=0.0
    if len(st)>2:
        sv=np.array(st); sv=sv[sv>-70]
        if len(sv)>2:
            ss=np.sort(sv); lra=float(ss[int(0.95*len(ss))]-ss[int(0.1*len(ss))])
    std,sttd=decimate(np.array(st),np.array(st_t))
    md,mtd=decimate(np.array(mom),np.array(mom_t))
    return {'integrated':round(float(integrated),1),'shortTerm':std,'shortTermTimes':sttd,
            'momentary':md,'momentaryTimes':mtd,'lra':round(lra,1),
            'maxShortTerm':round(float(max(st)) if st else -70,1),
            'maxMomentary':round(float(max(mom)) if mom else -70,1),
            'histogram':compute_loudness_histogram(st)}

def compute_loudness_histogram(short_term):
    if not short_term: return {'bins':[],'counts':[]}
    arr=np.array(short_term); arr=arr[arr>-60]
    if len(arr)<2: return {'bins':[],'counts':[]}
    counts,edges=np.histogram(arr, bins=30)
    centers=((edges[:-1]+edges[1:])/2).tolist()
    return {'bins':[round(b,1) for b in centers],'counts':counts.tolist()}

def compute_true_peak(y, sr):
    from scipy.signal import resample_poly
    chs=[y] if y.ndim==1 else [y[0],y[1]]
    tpdb=[]; clips=[]; pot=[]; pt=[]
    for ci,ch in enumerate(chs):
        yu=resample_poly(ch,up=4,down=1)
        tp=float(np.max(np.abs(yu))); td=20*np.log10(tp+1e-12); tpdb.append(round(td,2))
        thr=10**(-0.1/20.0); blk=2048
        for s in range(0,len(ch)-blk,blk):
            seg=ch[s:s+blk]; su=resample_poly(seg,up=4,down=1); pv=float(np.max(np.abs(su)))
            if pv>=thr:
                clips.append({'time':round(float(s/sr),3),'channel':ci,'peak_db':round(20*np.log10(pv+1e-12),2)})
        w=int(0.05*sr); h=int(0.02*sr)
        for s in range(0,len(ch)-w,h):
            seg=ch[s:s+w]; pv=float(np.max(np.abs(seg)))
            pot.append(round(max(20*np.log10(pv+1e-12),-60),2)); pt.append(round(float(s/sr),4))
    if len(pot)>600:
        step=len(pot)//600; pot=pot[::step]; pt=pt[::step]
    if len(clips)>100: clips=clips[:100]
    return {'truePeakDb':tpdb,'maxTruePeak':round(float(max(tpdb)),2),
            'clipPositions':clips,'clipCount':len(clips),'peakOverTime':pot,'peakTimes':pt}

def compute_spectrum(y, sr):
    import librosa
    nfft=4096; hl=2048
    S=np.abs(librosa.stft(y if y.ndim==1 else y[0],n_fft=nfft,hop_length=hl))
    Sdb=librosa.amplitude_to_db(S,ref=np.max)
    freqs=librosa.fft_frequencies(sr=sr,n_fft=nfft)
    times=librosa.frames_to_time(np.arange(S.shape[1]),sr=sr,hop_length=hl)
    avg=np.mean(Sdb,axis=1)
    mfb=256
    if len(freqs)>mfb:
        step=len(freqs)//mfb; fd=freqs[::step]; ad=avg[::step]
    else: fd=freqs; ad=avg
    # Heatmap data
    mt,mf=150,128
    ts=max(1,S.shape[1]//mt); fs=max(1,S.shape[0]//mf)
    hm=Sdb[::fs,::ts]; hf=freqs[::fs]; ht=times[::ts]
    bands={'Sub (<60 Hz)':(0,60),'Bass (60-250 Hz)':(60,250),'Low-Mid (250-500 Hz)':(250,500),
           'Mid (500-2k Hz)':(500,2000),'High-Mid (2-6k Hz)':(2000,6000),'High (6-20k Hz)':(6000,20000)}
    te=np.sum(S**2)+1e-12; bb={}
    for bn,(fl,fh) in bands.items():
        mask=(freqs>=fl)&(freqs<fh); bb[bn]=round(float(np.sum(S[mask,:]**2)/te*100),1)
    return {'avgSpectrum':ad.tolist(),'avgSpectrumFreqs':fd.tolist(),
            'heatmap':hm.tolist(),'heatmapFreqs':hf.tolist(),'heatmapTimes':ht.tolist(),
            'bandBalance':bb}

def compute_stereo(y, sr):
    if y.ndim==1:
        return {'isMono':True,'avgCorrelation':1.0,'correlationOverTime':[1.0],
                'correlationTimes':[0.0],'stereoWidth':[0.0],'stereoWidthTimes':[0.0],
                'msBalance':{'mid':100.0,'side':0.0},'avgWidth':0.0,
                'goniometer':{'x':[],'y':[]}}
    L,R=y[0],y[1]; mid=(L+R)/2; side=(L-R)/2
    w=int(0.1*sr); h=int(0.05*sr)
    corr=[]; ct=[]; wid=[]; wt=[]
    for s in range(0,len(L)-w,h):
        ls,rs=L[s:s+w],R[s:s+w]
        ln,rn=ls-np.mean(ls),rs-np.mean(rs)
        d=np.sqrt(np.sum(ln**2)*np.sum(rn**2))
        c=float(np.sum(ln*rn)/d) if d>1e-12 else 1.0
        corr.append(round(c,4)); ct.append(round(float(s/sr),3))
        wid.append(round((1-c)/2,4)); wt.append(round(float(s/sr),3))
    me=float(np.sum(mid**2)); se=float(np.sum(side**2)); tot=me+se+1e-12
    if len(corr)>500:
        step=len(corr)//500
        corr=corr[::step]; ct=ct[::step]; wid=wid[::step]; wt=wt[::step]
    # Goniometer data (subsample for viz)
    gon_n=min(5000,len(L))
    step_g=max(1,len(L)//gon_n)
    gx=((L[::step_g]-R[::step_g])/2).tolist()
    gy=((L[::step_g]+R[::step_g])/2).tolist()
    return {'isMono':False,'avgCorrelation':round(float(np.mean(corr)),3) if corr else 1.0,
            'correlationOverTime':corr,'correlationTimes':ct,
            'stereoWidth':wid,'stereoWidthTimes':wt,
            'msBalance':{'mid':round(me/tot*100,1),'side':round(se/tot*100,1)},
            'avgWidth':round(float(np.mean(wid)),3) if wid else 0.0,
            'goniometer':{'x':[round(v,4) for v in gx[:2000]],'y':[round(v,4) for v in gy[:2000]]}}

def compute_dynamics(y, sr):
    ym=np.mean(y,axis=0) if y.ndim>1 else y
    rms_t=float(np.sqrt(np.mean(ym**2))); peak_t=float(np.max(np.abs(ym)))
    cf=round(float(20*np.log10(peak_t/rms_t)),1) if rms_t>1e-12 else 0.0
    rdb=round(float(20*np.log10(rms_t+1e-12)),1); pdb=round(float(20*np.log10(peak_t+1e-12)),1)
    blk=int(3*sr); drv=[]
    for s in range(0,len(ym)-blk,blk):
        seg=ym[s:s+blk]; sr_=np.sqrt(np.mean(seg**2)); sp=np.max(np.abs(seg))
        if sr_>1e-12: drv.append(20*np.log10(sp/sr_))
    dr=round(float(np.mean(drv)),1) if drv else 0.0
    w=int(0.1*sr); h=int(0.05*sr)
    rot=[]; pot=[]; dt=[]
    for s in range(0,len(ym)-w,h):
        seg=ym[s:s+w]
        rot.append(round(float(20*np.log10(np.sqrt(np.mean(seg**2))+1e-12)),2))
        pot.append(round(float(20*np.log10(np.max(np.abs(seg))+1e-12)),2))
        dt.append(round(float(s/sr),3))
    if len(rot)>500:
        step=len(rot)//500; rot=rot[::step]; pot=pot[::step]; dt=dt[::step]
    return {'crestFactorDb':cf,'drMeter':dr,'rmsDb':rdb,'peakDb':pdb,
            'rmsOverTime':rot,'peakOverTime':pot,'dynamicsTimes':dt}

def compute_key(y, sr):
    import librosa
    ym=np.mean(y,axis=0) if y.ndim>1 else y
    yh,_=librosa.effects.hpss(ym)
    chroma=librosa.feature.chroma_cqt(y=yh,sr=sr)
    ca=np.mean(chroma,axis=1)
    maj=np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])
    mn=np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])
    bc=-2; bk='C'; bm='dur'
    for sh in range(12):
        s=np.roll(ca,sh)
        cm=float(np.corrcoef(s,maj)[0,1])
        if cm>bc: bc=cm; bk=NOTES[(12-sh)%12]; bm='dur'
        cn=float(np.corrcoef(s,mn)[0,1])
        if cn>bc: bc=cn; bk=NOTES[(12-sh)%12]; bm='moll'
    return {'key':bk,'mode':bm,'keyFull':f'{bk}-{bm}','confidence':round(float(bc),3),
            'chromaDistribution':ca.tolist(),'chromaLabels':NOTES}

def compute_tempo_and_chords(y, sr):
    import librosa
    ym=np.mean(y,axis=0) if y.ndim>1 else y
    oe=librosa.onset.onset_strength(y=ym,sr=sr)
    dt=librosa.feature.tempo(onset_envelope=oe,sr=sr,aggregate=None)
    tt=librosa.frames_to_time(np.arange(len(dt)),sr=sr)
    avg=round(float(np.median(dt)),1)
    
    if len(dt)>500:
        step=len(dt)//500; dt=dt[::step]; tt=tt[::step]
        
    return {'avgTempo':avg,'tempoOverTime':[round(float(t),1) for t in dt],
            'tempoTimes':[round(float(t),3) for t in tt],'chordSegments':[]}

# ═══════════════════════════════════════════════════════════
#  NEW: Crest Factor, Waveform, Fade, Lossy, QC, AI
# ═══════════════════════════════════════════════════════════

def compute_crest_factor(y, sr):
    ym=np.mean(y,axis=0) if y.ndim>1 else y
    w=int(0.1*sr); h=int(0.05*sr); cf=[]; ct=[]
    for s in range(0,len(ym)-w,h):
        seg=ym[s:s+w]; r=np.sqrt(np.mean(seg**2)); p=np.max(np.abs(seg))
        c=20*np.log10(p/(r+1e-12)) if r>1e-12 else 0
        cf.append(round(float(c),2)); ct.append(round(float(s/sr),3))
    if len(cf)>500:
        step=len(cf)//500; cf=cf[::step]; ct=ct[::step]
    return {'crestOverTime':cf,'crestTimes':ct,
            'avgCrest':round(float(np.mean(cf)),1) if cf else 0}

def compute_waveform(y, sr):
    ym=np.mean(y,axis=0) if y.ndim>1 else y
    pts=1000; bs=max(1,len(ym)//pts)
    maxv=[]; minv=[]; rmsv=[]; wt=[]
    for i in range(0,len(ym)-bs,bs):
        seg=ym[i:i+bs]
        maxv.append(round(float(np.max(seg)),4))
        minv.append(round(float(np.min(seg)),4))
        rmsv.append(round(float(np.sqrt(np.mean(seg**2))),4))
        wt.append(round(float(i/sr),3))
    return {'max':maxv,'min':minv,'rms':rmsv,'times':wt}

def compute_fade_detection(y, sr):
    ym=np.mean(y,axis=0) if y.ndim>1 else y
    w=int(0.05*sr); h=int(0.02*sr)
    env=[]
    for s in range(0,len(ym)-w,w):
        env.append(float(np.sqrt(np.mean(ym[s:s+w]**2))))
    env=np.array(env)
    if len(env)<10: return {'fadeIn':None,'fadeOut':None}
    # Fade in
    fi=None; thr=np.max(env)*0.1
    for i in range(min(len(env),50)):
        if env[i]>thr:
            if i>2: fi={'duration':round(float(i*w/sr),2),'type':'linear'}
            break
    # Fade out
    fo=None
    for i in range(len(env)-1,max(0,len(env)-50),-1):
        if env[i]>thr:
            remaining=len(env)-1-i
            if remaining>2: fo={'duration':round(float(remaining*w/sr),2),'type':'linear'}
            break
    return {'fadeIn':fi,'fadeOut':fo}

def detect_lossy_origin(y, sr):
    import librosa
    ym=np.mean(y,axis=0) if y.ndim>1 else y
    S=np.abs(librosa.stft(ym,n_fft=4096))
    freqs=librosa.fft_frequencies(sr=sr,n_fft=4096)
    avg=np.mean(S,axis=1)
    # Check for sharp cutoff above 16kHz
    mask16=freqs>=16000; mask14=((freqs>=14000)&(freqs<16000))
    if np.sum(mask16)>0 and np.sum(mask14)>0:
        e16=float(np.mean(avg[mask16])); e14=float(np.mean(avg[mask14]))
        ratio=e16/(e14+1e-12)
        if ratio<0.05:
            return {'isLossy':True,'confidence':round(min(1.0,(1-ratio)*0.8),2),
                    'cutoffHz':16000,'message':'Prawdopodobnie transkodowany z MP3/AAC (brak energii >16kHz)'}
    mask19=freqs>=19000
    if np.sum(mask19)>0:
        e19=float(np.mean(avg[mask19])); e14_=float(np.mean(avg[mask14]))
        r2=e19/(e14_+1e-12)
        if r2<0.01:
            return {'isLossy':True,'confidence':round(min(1.0,(1-r2)*0.5),2),
                    'cutoffHz':19000,'message':'Możliwy transkod z formatu stratnego (ograniczone widmo >19kHz)'}
    return {'isLossy':False,'confidence':0.0,'cutoffHz':None,'message':'Brak oznak kompresji stratnej'}

def compute_auto_qc(y, sr, results):
    issues=[]
    ym=np.mean(y,axis=0) if y.ndim>1 else y
    # DC offset (>-90 dBFS trigger)
    dc=float(np.mean(ym))
    if abs(dc)>0.0000316:
        issues.append({'type':'warning','cat':'DC Offset','msg':f'DC Offset ({20*np.log10(abs(dc)+1e-12):.1f} dBFS) odbiera asymetryczny headroom. Zastosuj filtr HPF (1-5 Hz) na sumie.','sev':'medium'})
    # Clipping (Intersample Peaks)
    if results['truePeak']['clipCount']>500:
        issues.append({'type':'error','cat':'Clipping (Hard)','msg':f'Wykryto drastyczny hard clipping ({results["truePeak"]["clipCount"]} ISP). Utrata informacji ciągłej, rekomendowana interwencja pre-master oznaczająca redukcję gainu przed limiterem (declipping).','sev':'high'})
    elif results['truePeak']['clipCount']>0:
        issues.append({'type':'warning','cat':'Clipping (Soft ISP)','msg':f'Wykryto {results["truePeak"]["clipCount"]} intersample peaks. Zalecane obniżenie sufitu (ceiling) limitera.','sev':'medium'})
    # True Peak & PLR
    lufs = results['lufs']['integrated']
    tp=results['truePeak']['maxTruePeak']
    plr = tp - lufs
    if plr < 8:
        issues.append({'type':'warning','cat':'PLR (Dynamika M/M)','msg':f'Bardzo niski wskaźnik Peak to Loudness Ratio (PLR: {plr:.1f} dB). Miks nosi silne ślady wciskania w limit zjawisk Loudness War, gubiąc naturalny punch.','sev':'medium'})
    
    if tp>0.1:
        issues.append({'type':'error','cat':'True Peak','msg':f'True Peak ({tp} dBTP) przekracza sprzętowe zero cyfrowe (clipping). Koniecznie opuść ceiling.','sev':'high'})
    elif tp>-1.0:
        issues.append({'type':'warning','cat':'True Peak','msg':f'True Peak ({tp} dBTP) przekracza zalecane dla streamingu -1 dBTP (ale jest bezpieczny dla CD).','sev':'medium'})
    # Phase
    if not results['stereo']['isMono']:
        ac=results['stereo']['avgCorrelation']
        if ac<0:
            issues.append({'type':'error','cat':'Faza','msg':f'Problemy fazowe! Korelacja: {ac}','sev':'high'})
        elif ac<0.3:
            issues.append({'type':'warning','cat':'Faza','msg':f'Bardzo szerokie stereo, ryzyko mono compatibility. Korelacja: {ac}','sev':'medium'})
    # Sub-bass
    sub=results['spectrum']['bandBalance'].get('Sub (<60 Hz)',0)
    if sub>15:
        issues.append({'type':'warning','cat':'Sub-Bass','msg':f'Nadmiar energii sub-bass: {sub}%','sev':'medium'})
    # Dynamic range
    dr=results['dynamics']['drMeter']
    if dr<5:
        issues.append({'type':'warning','cat':'Dynamika','msg':f'Niska dynamika: {dr} dB — może brzmieć przekompresowane','sev':'medium'})
    # LRA
    lra=results['lufs']['lra']
    if lra<3:
        issues.append({'type':'warning','cat':'Loudness Range','msg':f'Bardzo niska loudness range: {lra} LU','sev':'low'})
    # Silence
    sil_t=0.001; sil_s=int(2*sr)
    if len(ym)>sil_s:
        if np.sqrt(np.mean(ym[:sil_s]**2))<sil_t:
            issues.append({'type':'info','cat':'Cisza','msg':'Ponad 2s ciszy na początku','sev':'low'})
        if np.sqrt(np.mean(ym[-sil_s:]**2))<sil_t:
            issues.append({'type':'info','cat':'Cisza','msg':'Ponad 2s ciszy na końcu','sev':'low'})
    # Lossy
    lossy=results.get('lossy',{})
    if lossy.get('isLossy'):
        issues.append({'type':'warning','cat':'Transkod','msg':lossy['message'],'sev':'medium'})
    # Verdict
    errs=len([i for i in issues if i['type']=='error'])
    warns=len([i for i in issues if i['type']=='warning'])
    if errs>0: verdict='fail'; vtxt='⚠️ Wymaga poprawek'
    elif warns>0: verdict='warning'; vtxt='⚡ Akceptowalne z zastrzeżeniami'
    else: verdict='pass'; vtxt='✅ Gotowy do dystrybucji'
    return {'issues':issues,'verdict':verdict,'verdictText':vtxt,
            'errorCount':errs,'warningCount':warns,
            'infoCount':len([i for i in issues if i['type']=='info']),
            'dcOffset':round(dc,6)}

def generate_ai_suggestions(results):
    tips=[]
    lufs=results['lufs']['integrated']
    tp=results['truePeak']['maxTruePeak']
    dr=results['dynamics']['drMeter']
    cf=results.get('crest', {}).get('crestFactorDb', 0)
    
    # LUFS & Normalization
    if lufs>-11:
        att = abs(lufs - (-14))
        tips.append({'icon':'📉','title':'Agresywne ujemne wzmocnienie (Attenuation)','msg':f'Utwór ma głośność {lufs} LUFS. Platformy streamingowe ukarzą go ujemnym wzmocnieniem ok. -{att:.1f} dB (np. Spotify Normalization). Master będzie brzmiał punktowo "płaściej" od cichszej, bardziej dynamicznej konkurencji.'})
    elif lufs>-13:
        att = abs(lufs - (-14))
        tips.append({'icon':'📊','title':'Wysoka głośność','msg':f'LUFS ({lufs}) jest nieznacznie powyżej standardu EBU R128/streamingowego (-14 LUFS). Spodziewaj się ściszenia przez algorytmy o ok. {att:.1f} dB.'})
    elif lufs<-16:
        boost = abs((-14) - lufs)
        tips.append({'icon':'📈','title':'Niska głośność','msg':f'LUFS ({lufs}) jest poniżej większości targetów. Utwór zostanie zgłośniony ok. +{boost:.1f} dB, co może podnieść poziom szumu (noise floor) i wprowadzić interwencję wbudowanych limiterów platform streamingowych.'})
    
    # True Peak (uwzględnienie głośności do stratnego kodowania MP3/AAC)
    if lufs > -9 and tp > -2.0:
        tips.append({'icon':'📉','title':'Ryzyko Clippingu przy konwersji (MP3/AAC)','msg':f'Ponieważ Twój master jest bardzo głośny ({lufs} LUFS), True Peak równy {tp} dBTP to za mało marginesu. Gęste kodery wprowadzają fluktuacje nawet do +2 dBTP. Obniż ceiling (sufit) limitera do max -2.0 dBTP.'})
    elif tp>-1.0:
        tips.append({'icon':'📈','title':'True Peak powyżej bezpiecznej normy stramingowych','msg':f'Wartość True Peak ({tp} dBTP) przekracza uniwersalne bezpieczeństwo -1.0 dBTP zalecane przy standardowych dystrybucjach. Systemy D/A bez dużego HEADROOMu mogą tutaj charczeć.'})
        
    # Standard CD Audio (Red Book)
    if tp > 0.0:
        tips.append({'icon':'💿','title':'Brak zgodności z nośnikiem CD Audio','msg':f'Dla fizycznego standardu płyt CD (Red Book 16-bit), poziom True Peak nie może sprzętowo przekraczać zera (0.0 dBTP), a zaleca się absolutny sufit -0.3 dBTP. Przy {tp} dBTP tłocznia wygeneruje twarde trzaski na tańszych odtwarzaczach cyfrowych CD.'})
    else:
        tips.append({'icon':'💿','title':'Gotowość dla płyt CD Audio','msg':f'Ze zmierzonym szczytem {tp} dBTP utwór technicznie mieści się w limitach sprzętowych D/A dla fizycznego standardu zapisu CD Audio bez ryzyka drastycznego hard clippingu elektroniki z lat 80. i 90.'})

    # Crest Factor i Dynamika (Punch)
    if cf > 0:
        if cf < 6.0:
            tips.append({'icon':'🥊','title':'Nadmierna kompresja transjentów','msg':f'Crest Factor to jedyne {cf} dB. Różnica między transjentami (atak instrumentów) a średnim body sygnału jest znikoma. Miks może dusić i męczyć słuchacza ciągłą ścianą dźwięku.'})
        elif cf > 8 and cf < 12:
            tips.append({'icon':'🥊','title':'Świetny Crest Factor (Punch)','msg':f'Crest Factor ({cf} dB) oscyluje we wzorowym paśmie popowo-rockowym (8-12). Utwór zachował mocne, naturalne transjenty z odpowiednią gęstością tła.'})
        elif cf > 14:
            tips.append({'icon':'⚖️','title':'Ekstremalnie wysoka dynamika (Crest)','msg':f'Bardzo szczytowy charakter sygnału ({cf} dB CF). Zastanów się nad łagodną kompresją sumy na najostrzejszych pikach.'})

    # Phase / Mono
    if not results['stereo']['isMono']:
        ac=results['stereo']['avgCorrelation']
        if ac<0.3:
            tips.append({'icon':'🔊','title':'Brak spójności fazowej','msg':f'Średnia korelacja ({ac}) skazuje na to, że wiele pasm w Left/Right gra zupełnie co innego lub w kontr-fazie. Sprawdź odsłuch w czystym MONO - istnieje ryzyko zaniku fundamentu układu rytmicznego.'})
    
    # Spectral Tips
    sub=results['spectrum']['bandBalance'].get('Sub (<60 Hz)',0)
    if sub>15:
        tips.append({'icon':'🎚️','title':'Nadmierny sub-bas','msg':f'Zbyt dużo subsonicznej energii ({sub}% przed pasmem). Pożera to ogromnie dużo headroomu we wtyczkach procesujących (zwłaszcza w kompresorze). Zalecam HPF.'})
    
    hi=results['spectrum']['bandBalance'].get('High (6-20k Hz)',0)
    if hi<0.1:
        tips.append({'icon':'🎚️','title':'Mało górnego pasma (ciemny LTAS)','msg':f'Energia high to zaledwie {hi}%. Może odpowiadać to za stłumiony, bardzo ciemny / "pudełkowy" odcień. Przydadzą się filtry high-shelf na wokalu lub talerzach.'})
    elif hi>4:
        tips.append({'icon':'🎚️','title':'Przejaskrawione wysokie (LTAS)','msg':f'Przesyt góry ({hi}% w proporcji liniowej). W klasycznym rozkładzie (nachylenie spektralne -5dB/okt), to zwiastuje że utwór będzie boleśnie brzmieć na głośnych zestawach Hi-Fi i słuchawkach.'})
    
    if not tips:
        tips.append({'icon':'✅','title':'Mistrzowski balans!','msg':'Świetny LTAS (równowaga tonalna), bezpieczny Crest Factor, dobra gęstość i przemyślany headroom. Nic nie trzeba poprawiać przed wrzuceniem na algorytmy platform dystrybucyjnych.'})
    
    return tips

# ═══════════════════════════════════════════════════════════
#  Routes


@app.route('/')
def index():
    return render_template('index.html')

def run_full_analysis(filepath, original_filename):
    import librosa
    import numpy as np
    y_mono,sr=librosa.load(filepath,sr=44100,mono=True)
    y_stereo,_=librosa.load(filepath,sr=44100,mono=False)
    duration=round(float(len(y_mono)/sr),2)
    r={'filename':original_filename,'duration':duration,'sampleRate':sr,
       'channels':1 if y_stereo.ndim==1 else y_stereo.shape[0]}
    r['lufs']=compute_lufs(y_stereo,sr)
    r['truePeak']=compute_true_peak(y_stereo,sr)
    r['spectrum']=compute_spectrum(y_stereo,sr)
    r['stereo']=compute_stereo(y_stereo,sr)
    r['dynamics']=compute_dynamics(y_stereo,sr)
    r['key']=compute_key(y_stereo,sr)
    r['tempoChords']=compute_tempo_and_chords(y_stereo,sr)
    r['crest']=compute_crest_factor(y_stereo,sr)
    r['lossy']=detect_lossy_origin(y_stereo,sr)
    r['waveform']=compute_waveform(y_stereo,sr)
    r['fade']=compute_fade_detection(y_stereo,sr)
    r['qc']=compute_auto_qc(y_stereo,sr,r)
    r['aiTips']=generate_ai_suggestions(r)
    return sanitize_for_json(r)

from flask import request, jsonify, Response
from werkzeug.utils import secure_filename
import os, json

@app.route('/api/analyze', methods=['POST'])
def analyze_endpoint():
    if 'file' not in request.files: return jsonify({'error':'Brak pliku'}), 400
    f = request.files['file']
    filename = secure_filename(f.filename)
    path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    f.save(path)
    try:
        r = run_full_analysis(path, f.filename)
        return jsonify(r)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error':str(e)}), 500

@app.route('/api/compare', methods=['POST'])
def compare_endpoint():
    f_a = request.files.get('fileA'); f_b = request.files.get('fileB')
    if not (f_a and f_b): return jsonify({'error':'Dwa pliki wymagane'}), 400
    pa = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(f_a.filename))
    pb = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(f_b.filename))
    f_a.save(pa); f_b.save(pb)
    try:
        ra = run_full_analysis(pa, f_a.filename)
        rb = run_full_analysis(pb, f_b.filename)
        return jsonify({'trackA':ra, 'trackB':rb})
    except Exception as e:
        return jsonify({'error':str(e)}), 500

@app.route('/api/batch', methods=['POST'])
def batch_endpoint():
    files = request.files.getlist('files')
    if not files: return jsonify({'error':'Brak plików'}), 400
    
    def generate():
        total = len(files)
        yield json.dumps({'type':'filelist', 'total':total, 'files':[f.filename for f in files]}) + "\n"
        
        all_results = []
        errors = []
        for i, f in enumerate(files):
            path = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(f.filename))
            f.save(path)
            try:
                r = run_full_analysis(path, f.filename)
                
                flat = {
                    'filename': r['filename'],
                    'duration': r['duration'],
                    'lufs': r['lufs']['integrated'],
                    'truePeak': r['truePeak']['maxTruePeak'],
                    'dr': r['dynamics']['drMeter'],
                    'lra': r['lufs']['lra'],
                    'key': r['key']['keyFull'],
                    'tempo': r['tempoChords']['avgTempo'],
                    'verdict': r['qc']['verdictText'],
                    'issues': r['qc']['issues']
                }
                all_results.append(flat)
                yield json.dumps({'type':'progress', 'index':i+1, 'total':total, 'status':'ok', 'track':{'lufs':flat['lufs']}}) + "\n"
            except Exception as e:
                errors.append({'filename':f.filename, 'error':str(e)})
                yield json.dumps({'type':'progress', 'index':i+1, 'total':total, 'status':'error', 'filename':f.filename}) + "\n"
        
        if all_results:
            avg_lufs = sum([t['lufs'] for t in all_results])/len(all_results)
            for t in all_results:
                diff = t['lufs'] - avg_lufs
                if abs(diff) <= 1.0:
                    t['loudnessStatus'] = 'ok'
                    t['loudnessMsg'] = 'Głośność utworu spójna z albumem.'
                elif diff > 1.0:
                    t['loudnessStatus'] = 'too_loud'
                    t['loudnessMsg'] = f'Utwór głośniejszy o {diff:.1f} LU od średniej.'
                else:
                    t['loudnessStatus'] = 'too_quiet'
                    t['loudnessMsg'] = f'Utwór cichszy o {abs(diff):.1f} LU od średniej.'
        
        yield json.dumps({'type':'complete', 'tracks':all_results, 'errors':errors}) + "\n"
        
    return Response(generate(), mimetype='application/x-ndjson')

if __name__ == '__main__':
    app.run(port=5000, debug=True, use_reloader=False)

