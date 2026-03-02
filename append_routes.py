import io

code = """
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
    r['lossy']=check_lossy(y_stereo,sr)
    r['qc']=compute_auto_qc(y_stereo,sr,r)
    r['aiTips']=generate_ai_suggestions(r)
    return r

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
        yield json.dumps({'type':'filelist', 'total':total, 'files':[f.filename for f in files]}) + "\\n"
        
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
                yield json.dumps({'type':'progress', 'index':i+1, 'total':total, 'status':'ok', 'track':{'lufs':flat['lufs']}}) + "\\n"
            except Exception as e:
                errors.append({'filename':f.filename, 'error':str(e)})
                yield json.dumps({'type':'progress', 'index':i+1, 'total':total, 'status':'error', 'filename':f.filename}) + "\\n"
        
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
        
        yield json.dumps({'type':'complete', 'tracks':all_results, 'errors':errors}) + "\\n"
        
    return Response(generate(), mimetype='application/x-ndjson')

if __name__ == '__main__':
    app.run(port=5000, debug=True, use_reloader=False)
"""

with io.open('I:\\Analizator tempa utworu\\web\\app.py', 'a', encoding='utf-8') as f:
    f.write("\n" + code + "\n")
print("SUCCESS")
