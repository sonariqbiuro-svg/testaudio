/**
 * Sonariq Mastering Analyzer — Full Frontend
 */
let analysisData = null;
let batchAnalysisData = null;
let activeMode = 'single';
const charts = {};
Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.animation.duration = 800;

// ═══════ DOM ═══════
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const uploadSection = document.getElementById('upload-section');
const compareSection = document.getElementById('compare-section');
const batchSection = document.getElementById('batch-section');
const progressSection = document.getElementById('progress-section');
const resultsSection = document.getElementById('results-section');
const compareResults = document.getElementById('compare-results');
const batchResults = document.getElementById('batch-results');
const progressBar = document.getElementById('progress-bar');
const progressFilename = document.getElementById('progress-filename');
const progressPercent = document.getElementById('progress-percent');
const progressStatus = document.getElementById('progress-status');
const btnExportPdf = document.getElementById('btn-export-pdf');
const btnExportJson = document.getElementById('btn-export-json');

let fileA = null, fileB = null;

// ═══════ MODE TABS ═══════
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeMode = btn.dataset.mode;
        uploadSection.classList.toggle('hidden', activeMode !== 'single');
        compareSection.classList.toggle('hidden', activeMode !== 'compare');
        batchSection.classList.toggle('hidden', activeMode !== 'batch');
        resultsSection.classList.add('hidden');
        compareResults.classList.add('hidden');
        batchResults.classList.add('hidden');

        // Reset export buttons state depending on logic
        if (activeMode === 'single') {
            btnExportPdf.disabled = !analysisData;
            btnExportJson.disabled = !analysisData;
        } else if (activeMode === 'batch') {
            btnExportPdf.disabled = !batchAnalysisData;
            btnExportJson.disabled = !batchAnalysisData;
        } else {
            btnExportPdf.disabled = true;
            btnExportJson.disabled = true;
        }
    });
});

// ═══════ SINGLE UPLOAD ═══════
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('dragover'); if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); });
fileInput.addEventListener('change', e => { if (e.target.files.length) handleFile(e.target.files[0]); });

function handleFile(file) {
    const exts = ['.wav', '.mp3', '.flac', '.ogg', '.aiff'];
    if (!exts.includes('.' + file.name.split('.').pop().toLowerCase())) { alert('Nieobsługiwany format'); return; }
    startAnalysis(file);
}

// ═══════ COMPARE UPLOAD ═══════
const dzA = document.getElementById('drop-zone-a');
const dzB = document.getElementById('drop-zone-b');
const fiA = document.getElementById('file-input-a');
const fiB = document.getElementById('file-input-b');
const btnCompare = document.getElementById('btn-compare');

dzA.addEventListener('click', () => fiA.click());
dzB.addEventListener('click', () => fiB.click());
dzA.addEventListener('dragover', e => { e.preventDefault(); dzA.classList.add('dragover'); });
dzA.addEventListener('dragleave', () => dzA.classList.remove('dragover'));
dzA.addEventListener('drop', e => { e.preventDefault(); dzA.classList.remove('dragover'); if (e.dataTransfer.files.length) { fileA = e.dataTransfer.files[0]; dzA.querySelector('h3').textContent = fileA.name; checkCompareReady(); } });
dzB.addEventListener('dragover', e => { e.preventDefault(); dzB.classList.add('dragover'); });
dzB.addEventListener('dragleave', () => dzB.classList.remove('dragover'));
dzB.addEventListener('drop', e => { e.preventDefault(); dzB.classList.remove('dragover'); if (e.dataTransfer.files.length) { fileB = e.dataTransfer.files[0]; dzB.querySelector('h3').textContent = fileB.name; checkCompareReady(); } });
fiA.addEventListener('change', e => { if (e.target.files.length) { fileA = e.target.files[0]; dzA.querySelector('h3').textContent = fileA.name; checkCompareReady(); } });
fiB.addEventListener('change', e => { if (e.target.files.length) { fileB = e.target.files[0]; dzB.querySelector('h3').textContent = fileB.name; checkCompareReady(); } });
function checkCompareReady() { btnCompare.disabled = !(fileA && fileB); }
btnCompare.addEventListener('click', () => startCompare());

// ═══════ BATCH UPLOAD ═══════
const dzBatch = document.getElementById('drop-zone-batch');
const fiBatch = document.getElementById('file-input-batch');
dzBatch.addEventListener('click', () => fiBatch.click());
dzBatch.addEventListener('dragover', e => { e.preventDefault(); dzBatch.classList.add('dragover'); });
dzBatch.addEventListener('dragleave', () => dzBatch.classList.remove('dragover'));
dzBatch.addEventListener('drop', e => { e.preventDefault(); dzBatch.classList.remove('dragover'); if (e.dataTransfer.files.length) startBatch(e.dataTransfer.files); });
fiBatch.addEventListener('change', e => { if (e.target.files.length) startBatch(e.target.files); });

// ═══════ ANALYSIS ═══════
async function startAnalysis(file) {
    showProgress(file.name);
    const fd = new FormData(); fd.append('file', file);
    try {
        const iv = fakeProgress();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 600000);
        const res = await fetch('/api/analyze', { method: 'POST', body: fd, signal: controller.signal });
        clearTimeout(timeout);
        clearInterval(iv);
        const txt = await res.text();
        let data;
        try { data = JSON.parse(txt); } catch (e) { throw new Error('Serwer zwrócił nieprawidłowy JSON. Sprawdź konsolę serwera.'); }
        if (!res.ok) throw new Error(data.error || 'Błąd serwera');
        analysisData = data;
        finishProgress(() => { resultsSection.classList.remove('hidden'); renderResults(data); btnExportPdf.disabled = false; btnExportJson.disabled = false; });
    } catch (err) {
        if (err.name === 'AbortError') showError('Przekroczono czas analizy (10 min). Spróbuj mniejszy plik.');
        else showError(err.message);
    }
}

async function startCompare() {
    showProgress('Porównanie A/B...');
    const fd = new FormData(); fd.append('fileA', fileA); fd.append('fileB', fileB);
    try {
        const iv = fakeProgress();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 900000);
        const res = await fetch('/api/compare', { method: 'POST', body: fd, signal: controller.signal });
        clearTimeout(timeout);
        clearInterval(iv);
        const txt = await res.text();
        let data;
        try { data = JSON.parse(txt); } catch (e) { throw new Error('Nieprawidłowy JSON. Sprawdź konsolę serwera.'); }
        if (!res.ok) throw new Error(data.error || 'Błąd');
        finishProgress(() => { compareResults.classList.remove('hidden'); renderCompare(data); });
    } catch (err) {
        if (err.name === 'AbortError') showError('Przekroczono czas porównania (15 min).');
        else showError(err.message);
    }
}

async function startBatch(files) {
    showProgress(`Batch: ${files.length} plików...`, true);
    progressStatus.textContent = 'Wysyłanie plików na serwer...';

    // Create file list container below progress
    let batchFileList = document.getElementById('batch-file-list');
    if (!batchFileList) {
        batchFileList = document.createElement('div');
        batchFileList.id = 'batch-file-list';
        batchFileList.style.cssText = 'margin-top:16px;padding:12px 16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;max-height:300px;overflow-y:auto;';
        document.querySelector('.progress-container').appendChild(batchFileList);
    }
    batchFileList.innerHTML = '';
    batchFileList.style.display = 'none';

    const fd = new FormData();
    for (let f of files) fd.append('files', f);

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1800000);
        const res = await fetch('/api/batch', { method: 'POST', body: fd, signal: controller.signal });
        clearTimeout(timeout);

        if (!res.ok) {
            const txt = await res.text();
            let errMsg = 'Błąd serwera';
            try { errMsg = JSON.parse(txt).error || errMsg; } catch (e) { }
            throw new Error(errMsg);
        }

        // Setup per-track fake progress
        let currentBatchTrackIndex = 0;
        let currentTrackProgress = 0;
        const trackInterval = setInterval(() => {
            if (currentBatchTrackIndex >= 0) {
                const icon = document.getElementById(`batch-icon-${currentBatchTrackIndex}`);
                if (icon && !icon.textContent.includes('✅') && !icon.textContent.includes('❌')) {
                    if (currentTrackProgress < 95) {
                        // Zwolnienie logarytmiczne - im bliżej 95%, tym wolniej rośnie
                        let step = (96 - currentTrackProgress) * 0.02 + Math.random() * 0.4;
                        currentTrackProgress += step;
                        if (currentTrackProgress > 95) currentTrackProgress = 95;
                    }
                    icon.style.fontSize = '11px';
                    icon.style.fontWeight = '700';
                    icon.style.color = 'var(--accent-bright)';
                    icon.textContent = Math.round(currentTrackProgress) + '%';
                }
            }
        }, 600);

        // Read NDJSON stream line by line
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalData = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // Process complete lines
            const lines = buffer.split('\n');
            buffer = lines.pop(); // keep incomplete last line in buffer

            for (const line of lines) {
                if (!line.trim()) continue;
                let msg;
                try { msg = JSON.parse(line); } catch (e) { continue; }

                if (msg.type === 'filelist') {
                    // Show file list with waiting icons
                    currentBatchTrackIndex = 0;
                    currentTrackProgress = 0;
                    batchFileList.style.display = 'block';
                    batchFileList.innerHTML = `<div style="font-size:12px;color:#64748b;margin-bottom:8px;font-weight:600;">Utwory do analizy (${msg.total}):</div>` +
                        msg.files.map((name, i) =>
                            `<div id="batch-track-${i}" style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px;color:#94a3b8;">
                                <span id="batch-icon-${i}" style="font-size:16px;width:28px;text-align:center;">⏳</span>
                                <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</span>
                                <span id="batch-status-${i}" style="font-size:11px;color:#475569;"></span>
                            </div>`
                        ).join('');
                    progressBar.style.width = '5%';
                    progressPercent.textContent = '0%';
                    progressStatus.textContent = `Analizuję utwór 1 z ${msg.total}...`;
                }
                else if (msg.type === 'progress') {
                    const idx = msg.index - 1;
                    const icon = document.getElementById(`batch-icon-${idx}`);
                    const statusEl = document.getElementById(`batch-status-${idx}`);
                    const trackEl = document.getElementById(`batch-track-${idx}`);

                    if (msg.status === 'ok') {
                        if (icon) { icon.style.fontSize = '16px'; icon.textContent = '✅'; }
                        if (statusEl) { statusEl.textContent = `${msg.track.lufs} LUFS`; statusEl.style.color = '#4ade80'; }
                        if (trackEl) trackEl.style.color = '#e2e8f0';
                    } else {
                        if (icon) { icon.style.fontSize = '16px'; icon.textContent = '❌'; }
                        if (statusEl) { statusEl.textContent = 'Błąd'; statusEl.style.color = '#ef4444'; }
                        if (trackEl) trackEl.style.color = '#f87171';
                    }

                    // move to next track
                    currentBatchTrackIndex = msg.index; // equivalent to index + 1 for 0-indexing
                    currentTrackProgress = 0;

                    // Update real progress
                    const pct = Math.round((msg.index / msg.total) * 90) + 5;
                    progressBar.style.width = pct + '%';
                    progressPercent.textContent = pct + '%';
                    if (msg.index < msg.total) {
                        progressStatus.textContent = `Analizuję utwór ${msg.index + 1} z ${msg.total}...`;
                    } else {
                        progressStatus.textContent = 'Finalizacja wyników albumu...';
                    }

                    // Scroll to current track
                    const nextEl = document.getElementById(`batch-track-${msg.index}`);
                    if (nextEl) nextEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                }
                else if (msg.type === 'complete') {
                    finalData = msg;
                }
            }
        }

        clearInterval(trackInterval);

        // Process any remaining buffer
        if (buffer.trim()) {
            try {
                const msg = JSON.parse(buffer);
                if (msg.type === 'complete') finalData = msg;
            } catch (e) { }
        }

        if (finalData) {
            batchAnalysisData = finalData;
            progressBar.style.width = '100%';
            progressPercent.textContent = '100%';
            progressStatus.textContent = 'Analiza zakończona! ✅';
            setTimeout(() => {
                progressSection.classList.add('hidden');
                batchFileList.style.display = 'none';
                batchResults.classList.remove('hidden');
                renderBatch(batchAnalysisData);
                btnExportPdf.disabled = false;
                btnExportJson.disabled = false;
            }, 800);
        } else {
            throw new Error('Serwer nie zwrócił wyników końcowych.');
        }

    } catch (err) {
        if (batchFileList) batchFileList.style.display = 'none';
        if (err.name === 'AbortError') showError('Przekroczono czas analizy batch (30 min). Spróbuj mniej plików.');
        else showError(err.message);
    }
}

function showProgress(name, isBatch = false) {
    [uploadSection, compareSection, batchSection, resultsSection, compareResults, batchResults].forEach(s => s.classList.add('hidden'));
    progressSection.classList.remove('hidden');
    progressFilename.textContent = name;
    progressPercent.textContent = 'Wysyłanie...';
    progressBar.style.width = '10%';
    progressStatus.textContent = 'Przesyłanie pliku...';
    progressStatus.style.color = '';

    const squaresEl = document.getElementById('progress-squares');
    if (squaresEl) {
        squaresEl.style.display = isBatch ? 'none' : 'flex';
    }

    resetSquares();
}

function resetSquares() {
    for (let i = 0; i < 10; i++) {
        const sq = document.getElementById('psq-' + i);
        if (sq) { sq.classList.remove('done', 'active'); }
    }
}

function updateSquares(percent) {
    const filled = Math.floor(percent / 10);
    for (let i = 0; i < 10; i++) {
        const sq = document.getElementById('psq-' + i);
        if (!sq) continue;
        if (i < filled) {
            sq.classList.add('done');
            sq.classList.remove('active');
        } else if (i === filled && percent > 0) {
            sq.classList.remove('done');
            sq.classList.add('active');
        } else {
            sq.classList.remove('done', 'active');
        }
    }
}
function fakeProgress(speedFactor = 1) {
    let p = 5;
    let tick = 0;
    const interval = Math.max(500, 800 * speedFactor);
    const qcSubSteps = [
        'Kontrola jakości — sprawdzanie DC offset...',
        'Kontrola jakości — analiza clippingu...',
        'Kontrola jakości — weryfikacja True Peak...',
        'Kontrola jakości — sprawdzanie fazy stereo...',
        'Rekomendacje AI — analiza sub-bass...',
        'Rekomendacje AI — ocena dynamiki...',
        'Rekomendacje AI — sprawdzanie zgodności ze streamingiem...',
        'Rekomendacje AI — generowanie sugestii...',
        'Finalizacja wyników...',
    ];
    return setInterval(() => {
        tick++;
        let increment;
        if (p < 75) increment = Math.random() * 3 / speedFactor;
        else if (p < 85) increment = Math.random() * 1.5 / speedFactor;
        else if (p < 92) increment = Math.random() * 0.6 / speedFactor;
        else increment = Math.random() * 0.25 / speedFactor;
        p = Math.min(p + increment, 98.5);
        progressBar.style.width = p + '%'; progressPercent.textContent = Math.round(p) + '%';
        updateSquares(p);
        if (p < 15) progressStatus.textContent = 'Przesyłanie i dekodowanie audio...';
        else if (p < 30) progressStatus.textContent = 'Przetwarzanie audio...';
        else if (p < 45) progressStatus.textContent = 'Analiza LUFS i True Peak...';
        else if (p < 60) progressStatus.textContent = 'Analiza widma i spektrogramu...';
        else if (p < 75) progressStatus.textContent = 'Analiza stereo i dynamiki...';
        else if (p < 85) progressStatus.textContent = 'Detekcja tonacji i akordów...';
        else {
            const idx = Math.floor((tick / 3) % qcSubSteps.length);
            progressStatus.textContent = qcSubSteps[idx];
        }
    }, interval);
}
function finishProgress(cb) {
    progressBar.style.width = '100%'; progressPercent.textContent = '100%'; progressStatus.textContent = 'Analiza zakończona! ✅';
    updateSquares(100);
    setTimeout(() => { progressSection.classList.add('hidden'); cb(); }, 600);
}
function showError(msg) {
    progressBar.style.width = '100%'; progressBar.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
    progressPercent.textContent = 'Błąd!'; progressStatus.textContent = '❌ ' + msg; progressStatus.style.color = '#ef4444';
    resetSquares();
    setTimeout(() => {
        progressSection.classList.add('hidden');
        // Show correct section back
        const activeMode = document.querySelector('.mode-btn.active');
        const mode = activeMode ? activeMode.dataset.mode : 'single';
        if (mode === 'single') uploadSection.classList.remove('hidden');
        else if (mode === 'compare') compareSection.classList.remove('hidden');
        else batchSection.classList.remove('hidden');
        progressStatus.style.color = '';
        progressBar.style.background = '';
    }, 5000);
}

// ═══════ HELPERS ═══════
function safeVal(v, fb = '—') { return (v === null || v === undefined || (typeof v === 'number' && isNaN(v))) ? fb : v; }
function formatTime(s) { return Math.floor(s / 60) + ':' + Math.floor(s % 60).toString().padStart(2, '0'); }
function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }
function resampleToLength(arr, tl) { if (!arr || arr.length === tl) return arr; if (!arr.length) return new Array(tl).fill(0); const r = [], ratio = arr.length / tl; for (let i = 0; i < tl; i++) r.push(arr[Math.min(Math.floor(i * ratio), arr.length - 1)]); return r; }
function getStereoLabel(c) { if (c > 0.9) return 'Bardzo wąskie'; if (c > 0.6) return 'Normalne'; if (c > 0.3) return 'Szerokie'; if (c > 0) return 'Bardzo szerokie'; return '⚠️ Problem fazowy'; }
const chartTooltip = { backgroundColor: 'rgba(10,10,18,0.9)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 };
const chartGridX = { color: 'rgba(255,255,255,0.03)' };
const chartGridY = { color: 'rgba(255,255,255,0.04)' };

// ═══════ RENDER RESULTS ═══════
function renderResults(d) {
    document.getElementById('val-lufs-int').textContent = safeVal(d.lufs.integrated);
    document.getElementById('val-true-peak').textContent = safeVal(d.truePeak.maxTruePeak);
    document.getElementById('val-dr').textContent = safeVal(d.dynamics.drMeter);
    document.getElementById('val-lra').textContent = safeVal(d.lufs.lra);
    document.getElementById('val-key').textContent = safeVal(d.key.keyFull);
    const conf = d.key.confidence; document.getElementById('val-key-conf').textContent = conf != null ? `Pewność: ${(conf * 100).toFixed(0)}%` : '—';
    document.getElementById('val-tempo').textContent = safeVal(d.tempoChords.avgTempo);
    document.getElementById('val-stereo-corr').textContent = safeVal(d.stereo.avgCorrelation);
    document.getElementById('val-stereo-label').textContent = d.stereo.isMono ? 'MONO' : getStereoLabel(d.stereo.avgCorrelation);
    document.getElementById('val-clip').textContent = safeVal(d.truePeak.clipCount);
    if (d.truePeak.clipCount === 0) document.getElementById('val-clip').style.color = '#22c55e';

    renderQCBanner(d.qc);
    renderStreamingTargets(d);
    renderLufsChart(d.lufs);
    renderLufsHistogram(d.lufs.histogram);
    renderCrestChart(d.crest);
    renderPeakChart(d.truePeak);
    renderWaveformChart(d.waveform);
    renderFadeInfo(d.fade);
    renderLossyInfo(d.lossy);
    renderSpectrumCharts(d.spectrum);
    renderHeatmap(d.spectrum);
    renderStereoCharts(d.stereo);
    renderGoniometer(d.stereo.goniometer);
    renderDynamicsChart(d.dynamics);
    renderKeyCharts(d.key);
    renderClipList(d.truePeak);
    renderChordsChart(d.tempoChords);
    renderTempoChart(d.tempoChords);
    renderQCIssues(d.qc);
    renderAITips(d.aiTips);
}

// ═══════ QC BANNER ═══════
function renderQCBanner(qc) {
    const box = document.getElementById('qc-verdict-box');
    box.className = 'qc-verdict ' + qc.verdict;
    document.getElementById('qc-verdict-text').textContent = qc.verdictText;
    document.getElementById('qc-errors').textContent = qc.errorCount + ' błędów';
    document.getElementById('qc-warnings').textContent = qc.warningCount + ' ostrzeżeń';
    document.getElementById('qc-infos').textContent = qc.infoCount + ' info';
    // Show issue details in banner
    const details = document.getElementById('qc-banner-details');
    if (qc.issues.length > 0) {
        details.innerHTML = qc.issues.map(i => {
            const icon = i.type === 'error' ? '❌' : i.type === 'warning' ? '⚠️' : 'ℹ️';
            return `<span class="qc-banner-item ${i.type}">${icon} ${i.cat}: ${i.msg}</span>`;
        }).join('');
    } else { details.innerHTML = ''; }
}

// ═══════ QC ISSUES ═══════
function renderQCIssues(qc) {
    const el = document.getElementById('qc-issues-list');
    if (!qc.issues.length) { el.innerHTML = '<div class="qc-issue pass"><span class="qc-issue-icon">✅</span><div><strong>Brak problemów</strong><p>Plik przeszedł wszystkie testy kontroli jakości.</p></div></div>'; return; }
    el.innerHTML = qc.issues.map(i => `<div class="qc-issue ${i.type}"><span class="qc-issue-icon">${i.type === 'error' ? '❌' : i.type === 'warning' ? '⚠️' : 'ℹ️'}</span><div><strong>${i.cat}</strong><p>${i.msg}</p></div></div>`).join('');
}

// ═══════ AI TIPS ═══════
function renderAITips(tips) {
    const el = document.getElementById('ai-tips-list');
    el.innerHTML = tips.map(t => `<div class="ai-tip"><span class="ai-tip-icon">${t.icon}</span><div><strong>${t.title}</strong><p>${t.msg}</p></div></div>`).join('');
}

// ═══════ STREAMING TARGETS ═══════
function renderStreamingTargets(data) {
    const grid = document.getElementById('streaming-grid');
    const lufs = data.lufs.integrated, tp = data.truePeak.maxTruePeak;
    const targets = [{ name: 'Spotify', icon: '🟢', lufs: -14, tp: -1 }, { name: 'Apple Music', icon: '🍎', lufs: -16, tp: -1 }, { name: 'YouTube', icon: '🔴', lufs: -14, tp: -1 }, { name: 'Tidal', icon: '🔵', lufs: -14, tp: -1 }, { name: 'Amazon Music', icon: '📦', lufs: -14, tp: -2 }, { name: 'Deezer', icon: '🟣', lufs: -15, tp: -1 }];
    grid.innerHTML = targets.map(t => {
        const lufsDiff = Math.abs(lufs - t.lufs), tpOk = tp <= t.tp;
        let status, sc, reason = '';
        if (lufsDiff <= 1 && tpOk) { status = '✓ OK'; sc = 'pass'; }
        else if (lufsDiff <= 3 && tpOk) {
            status = '~ Blisko'; sc = 'warning';
            const dir = lufs > t.lufs ? 'za głośno' : 'za cicho';
            reason = `Różnica: ${lufsDiff.toFixed(1)} LUFS (${dir})`;
        } else {
            status = '✗ Nie'; sc = 'fail';
            const reasons = [];
            if (lufsDiff > 1) { reasons.push(`${lufs > t.lufs ? 'za głośno' : 'za cicho'} o ${lufsDiff.toFixed(1)} LUFS`); }
            if (!tpOk) reasons.push(`True Peak ${tp} przekracza ${t.tp} dBTP`);
            reason = reasons.join(' + ');
        }
        const reasonHtml = reason ? `<div class="target-reason">${reason}</div>` : '';
        return `<div class="target-item ${sc}"><span class="target-icon">${t.icon}</span><div class="target-info"><div class="target-name">${t.name}</div><div class="target-detail">Target: ${t.lufs} LUFS / ${t.tp} dBTP</div>${reasonHtml}</div><span class="target-status ${sc}">${status}</span></div>`;
    }).join('');
}

// ═══════ CHARTS ═══════

function renderLufsChart(lufs) {
    destroyChart('lufs');
    const ctx = document.getElementById('chart-lufs').getContext('2d');
    const labels = lufs.shortTermTimes.map(t => formatTime(t));
    charts['lufs'] = new Chart(ctx, {
        type: 'line', data: {
            labels, datasets: [
                { label: 'Short-term LUFS (3s)', data: lufs.shortTerm, borderColor: '#22d3ee', backgroundColor: 'rgba(34,211,238,0.08)', borderWidth: 2, fill: true, tension: .3, pointRadius: 0, pointHoverRadius: 4 },
                { label: 'Momentary LUFS (400ms)', data: resampleToLength(lufs.momentary, lufs.shortTerm.length), borderColor: 'rgba(168,85,247,0.6)', borderWidth: 1, fill: false, tension: .2, pointRadius: 0 },
                { label: `Integrated: ${lufs.integrated} LUFS`, data: new Array(labels.length).fill(lufs.integrated), borderColor: '#fbbf24', borderWidth: 2, borderDash: [8, 4], fill: false, pointRadius: 0 }
            ]
        }, options: { responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' }, plugins: { legend: { position: 'top', labels: { usePointStyle: true, padding: 16 } }, tooltip: chartTooltip }, scales: { x: { ticks: { maxTicksLimit: 12 }, grid: chartGridX }, y: { title: { display: true, text: 'LUFS' }, grid: chartGridY } } }
    });
}

function renderLufsHistogram(hist) {
    destroyChart('lufsHist');
    if (!hist || !hist.bins || !hist.bins.length) return;
    const ctx = document.getElementById('chart-lufs-hist').getContext('2d');
    charts['lufsHist'] = new Chart(ctx, { type: 'bar', data: { labels: hist.bins.map(b => b.toFixed(1)), datasets: [{ label: 'Rozkład LUFS', data: hist.counts, backgroundColor: 'rgba(34,211,238,0.4)', borderColor: '#22d3ee', borderWidth: 1, borderRadius: 3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: chartTooltip }, scales: { x: { title: { display: true, text: 'LUFS' }, grid: { display: false } }, y: { title: { display: true, text: 'Częstość' }, grid: chartGridY } } } });
}

function renderCrestChart(crest) {
    destroyChart('crest');
    const ctx = document.getElementById('chart-crest').getContext('2d');
    const labels = crest.crestTimes.map(t => formatTime(t));
    charts['crest'] = new Chart(ctx, { type: 'line', data: { labels, datasets: [{ label: 'Crest Factor (dB)', data: crest.crestOverTime, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1.5, fill: true, tension: .3, pointRadius: 0 }, { label: `Średni: ${crest.avgCrest} dB`, data: new Array(labels.length).fill(crest.avgCrest), borderColor: '#fbbf24', borderWidth: 2, borderDash: [6, 3], fill: false, pointRadius: 0 }] }, options: { responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' }, plugins: { legend: { position: 'top', labels: { usePointStyle: true } }, tooltip: chartTooltip }, scales: { x: { ticks: { maxTicksLimit: 10 }, grid: chartGridX }, y: { title: { display: true, text: 'dB' }, grid: chartGridY } } } });
}

function renderPeakChart(peak) {
    destroyChart('peak');
    const ctx = document.getElementById('chart-peak').getContext('2d');
    const labels = peak.peakTimes.map(t => formatTime(t));
    charts['peak'] = new Chart(ctx, {
        type: 'line', data: {
            labels, datasets: [
                { label: 'Peak Level', data: peak.peakOverTime, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.06)', borderWidth: 1.5, fill: true, tension: .2, pointRadius: 0 },
                { label: 'True Peak: ' + peak.maxTruePeak + ' dBTP', data: new Array(labels.length).fill(peak.maxTruePeak), borderColor: '#ef4444', borderWidth: 2, borderDash: [6, 3], fill: false, pointRadius: 0 },
                { label: '0 dBFS', data: new Array(labels.length).fill(0), borderColor: 'rgba(239,68,68,0.4)', borderWidth: 1, borderDash: [3, 3], fill: false, pointRadius: 0 },
                { label: '-1 dBTP Safe', data: new Array(labels.length).fill(-1), borderColor: 'rgba(34,197,94,0.4)', borderWidth: 1, borderDash: [3, 3], fill: false, pointRadius: 0 }
            ]
        }, options: { responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' }, plugins: { legend: { position: 'top', labels: { usePointStyle: true } }, tooltip: chartTooltip }, scales: { x: { ticks: { maxTicksLimit: 12 }, grid: chartGridX }, y: { title: { display: true, text: 'dBFS' }, grid: chartGridY, suggestedMax: 3 } } }
    });
}

function renderWaveformChart(wf) {
    destroyChart('waveform');
    const ctx = document.getElementById('chart-waveform').getContext('2d');
    const labels = wf.times.map(t => formatTime(t));
    const colors = wf.max.map((v, i) => { const pk = Math.max(Math.abs(v), Math.abs(wf.min[i])); if (pk > 0.99) return 'rgba(239,68,68,0.7)'; if (pk > 0.9) return 'rgba(245,158,11,0.5)'; return 'rgba(34,197,94,0.4)'; });
    charts['waveform'] = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label: 'Waveform', data: wf.max.map((v, i) => ({ x: i, y: [wf.min[i], v] })), backgroundColor: colors, borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `Peak: ${ctx.raw.y?.[1]?.toFixed(3) || ''}` } } }, scales: { x: { display: true, ticks: { maxTicksLimit: 12, callback: (v, i) => labels[i] || '' }, grid: { display: false } }, y: { min: -1, max: 1, title: { display: true, text: 'Amplitude' }, grid: chartGridY } }, indexAxis: 'x', barPercentage: 1, categoryPercentage: 1 } });
    // Fallback: simple line waveform
    destroyChart('waveform');
    charts['waveform'] = new Chart(ctx, {
        type: 'line', data: {
            labels, datasets: [
                { label: 'Max', data: wf.max, borderColor: 'rgba(34,197,94,0.8)', backgroundColor: 'rgba(34,197,94,0.15)', borderWidth: 1, fill: '+1', tension: .1, pointRadius: 0 },
                { label: 'Min', data: wf.min, borderColor: 'rgba(34,197,94,0.8)', backgroundColor: 'rgba(34,197,94,0.15)', borderWidth: 1, fill: false, tension: .1, pointRadius: 0 },
                { label: 'RMS', data: wf.rms, borderColor: 'rgba(34,211,238,0.6)', borderWidth: 1, fill: false, tension: .2, pointRadius: 0 },
                { label: 'RMS -', data: wf.rms.map(v => -v), borderColor: 'rgba(34,211,238,0.6)', borderWidth: 1, fill: false, tension: .2, pointRadius: 0 }
            ]
        }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: chartTooltip }, scales: { x: { ticks: { maxTicksLimit: 12 }, grid: { display: false } }, y: { min: -1, max: 1, grid: chartGridY } } }
    });
}

function renderFadeInfo(fade) {
    const el = document.getElementById('fade-grid');
    let html = '<div class="fade-item"><strong>Fade In:</strong> ';
    html += fade.fadeIn ? `${fade.fadeIn.duration}s (${fade.fadeIn.type})` : 'Brak';
    html += '</div><div class="fade-item"><strong>Fade Out:</strong> ';
    html += fade.fadeOut ? `${fade.fadeOut.duration}s (${fade.fadeOut.type})` : 'Brak';
    html += '</div>';
    el.innerHTML = html;
}

function renderLossyInfo(lossy) {
    const el = document.getElementById('lossy-result');
    if (lossy.isLossy) {
        el.innerHTML = `<div class="lossy-warn">⚠️ ${lossy.message}<br><small>Pewność: ${(lossy.confidence * 100).toFixed(0)}% | Cutoff: ${lossy.cutoffHz} Hz</small></div>`;
    } else {
        el.innerHTML = `<div class="lossy-ok">✅ ${lossy.message}</div>`;
    }
}

function renderSpectrumCharts(spectrum) {
    destroyChart('avgSpectrum');
    const ctx1 = document.getElementById('chart-avg-spectrum').getContext('2d');
    const fl = spectrum.avgSpectrumFreqs.map(f => f >= 1000 ? (f / 1000).toFixed(1) + 'k' : Math.round(f).toString());
    charts['avgSpectrum'] = new Chart(ctx1, { type: 'line', data: { labels: fl, datasets: [{ label: 'Średnie widmo (dB)', data: spectrum.avgSpectrum, borderColor: '#a855f7', backgroundColor: 'rgba(168,85,247,0.08)', borderWidth: 1.5, fill: true, tension: .4, pointRadius: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: chartTooltip }, scales: { x: { title: { display: true, text: 'Hz' }, ticks: { maxTicksLimit: 15 }, grid: chartGridX }, y: { title: { display: true, text: 'dB' }, grid: chartGridY } } } });

    destroyChart('bandBalance');
    const ctx2 = document.getElementById('chart-band-balance').getContext('2d');
    const bl = Object.keys(spectrum.bandBalance), bv = Object.values(spectrum.bandBalance);
    const bc = ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#3b82f6', '#a855f7'];
    charts['bandBalance'] = new Chart(ctx2, { type: 'doughnut', data: { labels: bl, datasets: [{ data: bv, backgroundColor: bc.map(c => c + '33'), borderColor: bc, borderWidth: 2, hoverOffset: 8 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { padding: 12, usePointStyle: true } }, tooltip: { callbacks: { label: c => `${c.label}: ${c.parsed}%` } } }, cutout: '55%' } });
}

function renderHeatmap(spectrum) {
    const canvas = document.getElementById('canvas-heatmap');
    const ctx = canvas.getContext('2d');
    const hm = spectrum.heatmap;
    if (!hm || !hm.length) return;
    const nf = hm.length, nt = hm[0].length;
    canvas.width = Math.max(nt, 600); canvas.height = Math.max(nf, 300);
    const pw = canvas.width / nt, ph = canvas.height / nf;
    let mn = -80, mx = 0;
    for (let f = 0; f < nf; f++) for (let t = 0; t < nt; t++) { const v = hm[f][t]; if (v != null) { if (v < mn) mn = v; if (v > mx) mx = v; } }
    for (let f = 0; f < nf; f++) for (let t = 0; t < nt; t++) {
        const v = hm[f][t] || mn;
        const norm = Math.max(0, Math.min(1, (v - mn) / (mx - mn)));
        const r = Math.floor(norm < 0.5 ? 0 : ((norm - 0.5) * 2) * 255);
        const g = Math.floor(norm < 0.5 ? (norm * 2) * 255 : (1 - (norm - 0.5) * 2) * 255);
        const b = Math.floor(norm < 0.5 ? 255 * (1 - norm * 2) : 0);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(t * pw, (nf - 1 - f) * ph, Math.ceil(pw), Math.ceil(ph));
    }
}

function renderStereoCharts(stereo) {
    destroyChart('correlation');
    const ctx1 = document.getElementById('chart-correlation').getContext('2d');
    const cl = stereo.correlationTimes.map(t => formatTime(t));
    charts['correlation'] = new Chart(ctx1, { type: 'line', data: { labels: cl, datasets: [{ label: 'Korelacja L/R', data: stereo.correlationOverTime, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.06)', borderWidth: 1.5, fill: true, tension: .3, pointRadius: 0 }, { label: 'Granica (0)', data: new Array(cl.length).fill(0), borderColor: 'rgba(239,68,68,0.4)', borderWidth: 1, borderDash: [4, 4], fill: false, pointRadius: 0 }] }, options: { responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' }, plugins: { legend: { position: 'top', labels: { usePointStyle: true } }, tooltip: chartTooltip }, scales: { x: { ticks: { maxTicksLimit: 12 }, grid: chartGridX }, y: { min: -1, max: 1, title: { display: true, text: 'Korelacja' }, grid: chartGridY } } } });

    destroyChart('width');
    const ctx2 = document.getElementById('chart-width').getContext('2d');
    charts['width'] = new Chart(ctx2, { type: 'line', data: { labels: stereo.stereoWidthTimes.map(t => formatTime(t)), datasets: [{ label: 'Szerokość stereo', data: stereo.stereoWidth, borderColor: '#ec4899', backgroundColor: 'rgba(236,72,153,0.08)', borderWidth: 1.5, fill: true, tension: .3, pointRadius: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { usePointStyle: true } }, tooltip: chartTooltip }, scales: { x: { ticks: { maxTicksLimit: 12 }, grid: chartGridX }, y: { min: 0, max: 1, title: { display: true, text: 'Szerokość' }, grid: chartGridY } } } });

    destroyChart('msBalance');
    const ctx3 = document.getElementById('chart-ms-balance').getContext('2d');
    charts['msBalance'] = new Chart(ctx3, { type: 'doughnut', data: { labels: ['Mid', 'Side'], datasets: [{ data: [stereo.msBalance.mid, stereo.msBalance.side], backgroundColor: ['rgba(59,130,246,0.3)', 'rgba(236,72,153,0.3)'], borderColor: ['#3b82f6', '#ec4899'], borderWidth: 2, hoverOffset: 8 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true } }, tooltip: { callbacks: { label: c => `${c.label}: ${c.parsed.toFixed(1)}%` } } }, cutout: '50%' } });
}

function renderGoniometer(gon) {
    const canvas = document.getElementById('canvas-goniometer');
    const ctx = canvas.getContext('2d');
    const s = Math.min(canvas.parentElement.clientWidth, 300);
    canvas.width = s; canvas.height = s;
    const cx = s / 2, cy = s / 2, scale = s * 0.4;
    ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, scale, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, s); ctx.lineTo(s, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s, s); ctx.stroke();
    ctx.fillStyle = 'rgba(74,222,128,0.15)';
    if (gon.x && gon.x.length) {
        for (let i = 0; i < gon.x.length; i++) {
            const px = cx + gon.x[i] * scale, py = cy - gon.y[i] * scale;
            ctx.fillRect(px, py, 2, 2);
        }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '11px Inter';
    ctx.fillText('L', 5, s / 2); ctx.fillText('R', s - 12, s / 2); ctx.fillText('M', s / 2 - 3, 12); ctx.fillText('S', s / 2 - 3, s - 5);
}

function renderDynamicsChart(dyn) {
    destroyChart('dynamics');
    const ctx = document.getElementById('chart-dynamics').getContext('2d');
    const labels = dyn.dynamicsTimes.map(t => formatTime(t));
    charts['dynamics'] = new Chart(ctx, {
        type: 'line', data: {
            labels, datasets: [
                { label: 'Peak Level', data: dyn.peakOverTime, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.05)', borderWidth: 1.5, fill: true, tension: .2, pointRadius: 0 },
                { label: 'RMS Level', data: dyn.rmsOverTime, borderColor: '#22d3ee', backgroundColor: 'rgba(34,211,238,0.08)', borderWidth: 1.5, fill: true, tension: .3, pointRadius: 0 }
            ]
        }, options: { responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' }, plugins: { legend: { position: 'top', labels: { usePointStyle: true } }, tooltip: { ...chartTooltip, callbacks: { afterBody: items => { if (items.length >= 2) { const d = Math.abs(items[0].parsed.y - items[1].parsed.y); return `Crest: ${d.toFixed(1)} dB`; } return ''; } } } }, scales: { x: { ticks: { maxTicksLimit: 12 }, grid: chartGridX }, y: { title: { display: true, text: 'dBFS' }, grid: chartGridY } } }
    });
}

function renderKeyCharts(key) {
    document.getElementById('key-display-note').textContent = key.key;
    document.getElementById('key-display-mode').textContent = key.mode === 'dur' ? 'MAJOR (DUR)' : 'MINOR (MOLL)';
    document.getElementById('key-display-conf').textContent = `Pewność: ${(key.confidence * 100).toFixed(0)}%`;
    destroyChart('chroma');
    const ctx = document.getElementById('chart-chroma').getContext('2d');
    const bc = key.chromaLabels.map(l => l === key.key ? '#ec4899' : 'rgba(168,85,247,0.5)');
    charts['chroma'] = new Chart(ctx, { type: 'bar', data: { labels: key.chromaLabels, datasets: [{ label: 'Energia Chroma', data: key.chromaDistribution, backgroundColor: bc.map(c => c.startsWith('rgba') ? c : c + '55'), borderColor: bc, borderWidth: 2, borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: chartTooltip }, scales: { x: { ticks: { font: { size: 12, weight: '600' } }, grid: { display: false } }, y: { title: { display: true, text: 'Energia' }, grid: chartGridY } } } });
}

function renderClipList(peak) {
    const el = document.getElementById('clip-list');
    if (peak.clipCount === 0) { el.innerHTML = '<div class="clip-none">✅ Brak clippingu — sygnał bezpieczny!</div>'; return; }
    el.innerHTML = peak.clipPositions.map(c => `<div class="clip-item"><span class="clip-time">${formatTime(c.time)}</span><span>Kanał ${c.channel === 0 ? 'L' : 'R'}</span><span class="clip-peak">${c.peak_db} dBTP</span></div>`).join('');
}

// ═══════ CHORDS CHART (step chart like desktop app) ═══════
function renderChordsChart(tc) {
    destroyChart('chords');
    const segs = tc.chordSegments;
    if (!segs || !segs.length) return;

    // Get unique chords in order of first appearance
    const seen = [];
    segs.forEach(s => { if (!seen.includes(s.chord)) seen.push(s.chord); });
    const chordToY = {};
    seen.forEach((name, idx) => { chordToY[name] = idx; });

    // Build step data
    const plotTimes = [];
    const plotY = [];
    segs.forEach(s => {
        plotTimes.push(s.start, s.end);
        plotY.push(chordToY[s.chord], chordToY[s.chord]);
    });

    const labels = plotTimes.map(t => formatTime(t));
    const colors = ['#a78bfa', '#34d399', '#f87171', '#38bdf8', '#fbbf24', '#ec4899', '#818cf8', '#fb923c', '#2dd4bf', '#e879f9', '#a3e635', '#f43f5e'];

    // Create colored background segments
    const bgSegments = segs.map(s => ({
        x: formatTime(s.start),
        x2: formatTime(s.end),
        y: chordToY[s.chord],
        chord: s.chord,
        color: colors[chordToY[s.chord] % colors.length]
    }));

    const ctx = document.getElementById('chart-chords').getContext('2d');
    charts['chords'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Akord',
                data: plotY,
                borderColor: '#4ade80',
                borderWidth: 2.5,
                fill: false,
                stepped: 'before',
                pointRadius: 0,
                pointHoverRadius: 6,
                pointBackgroundColor: '#4ade80',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...chartTooltip,
                    callbacks: {
                        label: (ctx) => {
                            const idx = Math.round(ctx.parsed.y);
                            return idx >= 0 && idx < seen.length ? seen[idx] : '';
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { maxTicksLimit: 15, font: { size: 10 } },
                    grid: chartGridX,
                    title: { display: true, text: 'Czas', font: { size: 11 } }
                },
                y: {
                    min: -0.5,
                    max: seen.length - 0.5,
                    ticks: {
                        callback: (val) => {
                            const idx = Math.round(val);
                            return idx >= 0 && idx < seen.length ? seen[idx] : '';
                        },
                        font: { size: 11, weight: '600' },
                        color: (ctx) => {
                            const idx = Math.round(ctx.tick.value);
                            return idx >= 0 && idx < colors.length ? colors[idx % colors.length] : '#94a3b8';
                        },
                        stepSize: 1
                    },
                    grid: { color: 'rgba(255,255,255,0.04)' }
                }
            }
        }
    });
}

// ═══════ TEMPO CHART ═══════
function renderTempoChart(tc) {
    destroyChart('tempo');
    if (!tc.tempoTimes || !tc.tempoTimes.length) return;
    const ctx = document.getElementById('chart-tempo').getContext('2d');
    const labels = tc.tempoTimes.map(t => formatTime(t));
    charts['tempo'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Tempo',
                    data: tc.tempoOverTime,
                    borderColor: '#38bdf8',
                    backgroundColor: 'rgba(56,189,248,0.08)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0
                },
                {
                    label: `Główne tempo: ${tc.avgTempo} BPM`,
                    data: new Array(labels.length).fill(tc.avgTempo),
                    borderColor: '#fbbf24',
                    borderWidth: 2.5,
                    borderDash: [8, 4],
                    fill: false,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { position: 'top', labels: { usePointStyle: true, padding: 16 } },
                tooltip: chartTooltip
            },
            scales: {
                x: { ticks: { maxTicksLimit: 12 }, grid: chartGridX },
                y: { title: { display: true, text: 'BPM' }, grid: chartGridY }
            }
        }
    });
}

// ═══════ COMPARE RENDER ═══════
function renderCompare(data) {
    document.getElementById('compare-name-a').textContent = data.a.filename;
    document.getElementById('compare-name-b').textContent = data.b.filename;
    const rows = [
        ['Integrated LUFS', data.a.lufs.integrated, data.b.lufs.integrated, data.diff.lufs, 'LUFS'],
        ['True Peak', data.a.truePeak.maxTruePeak, data.b.truePeak.maxTruePeak, data.diff.truePeak, 'dBTP'],
        ['Dynamic Range', data.a.dynamics.drMeter, data.b.dynamics.drMeter, data.diff.dr, 'dB'],
        ['Loudness Range', data.a.lufs.lra, data.b.lufs.lra, data.diff.lra, 'LU'],
        ['Stereo Corr.', data.a.stereo.avgCorrelation, data.b.stereo.avgCorrelation, data.diff.stereoCorr, ''],
        ['Tonacja', data.a.key.keyFull, data.b.key.keyFull, '—', ''],
        ['Tempo', data.a.tempoChords.avgTempo, data.b.tempoChords.avgTempo, '—', 'BPM'],
        ['QC', data.a.qc.verdictText, data.b.qc.verdictText, '—', ''],
    ];
    document.getElementById('compare-tbody').innerHTML = rows.map(r => {
        const diffClass = typeof r[3] === 'number' ? (r[3] > 0 ? 'diff-up' : 'diff-down') : '';
        const diffVal = typeof r[3] === 'number' ? (r[3] > 0 ? '+' : '') + r[3] + ' ' + r[4] : r[3];
        return `<tr><td>${r[0]}</td><td>${r[1]} ${r[4]}</td><td>${r[2]} ${r[4]}</td><td class="${diffClass}">${diffVal}</td></tr>`;
    }).join('');

    // Spectrum overlay
    destroyChart('compareSpectrum');
    const ctx = document.getElementById('chart-compare-spectrum').getContext('2d');
    const fl = data.a.spectrum.avgSpectrumFreqs.map(f => f >= 1000 ? (f / 1000).toFixed(1) + 'k' : Math.round(f) + '');
    charts['compareSpectrum'] = new Chart(ctx, {
        type: 'line', data: {
            labels: fl, datasets: [
                { label: 'A: ' + data.a.filename, data: data.a.spectrum.avgSpectrum, borderColor: '#22d3ee', borderWidth: 2, fill: false, tension: .4, pointRadius: 0 },
                { label: 'B: ' + data.b.filename, data: data.b.spectrum.avgSpectrum, borderColor: '#ec4899', borderWidth: 2, fill: false, tension: .4, pointRadius: 0 }
            ]
        }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { usePointStyle: true } }, tooltip: chartTooltip }, scales: { x: { title: { display: true, text: 'Hz' }, ticks: { maxTicksLimit: 15 }, grid: chartGridX }, y: { title: { display: true, text: 'dB' }, grid: chartGridY } } }
    });
}

// ═══════ BATCH RENDER ═══════
function renderBatch(data) {
    const container = document.getElementById('batch-results');
    // Remove any previously added info/stats divs (keep the table)
    container.querySelectorAll('.batch-info-box, .album-stats-box').forEach(el => el.remove());

    // ── Album Stats Banner ──
    if (data.albumStats) {
        const as = data.albumStats;
        const consistencyColors = {
            excellent: { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.4)', text: '#4ade80' },
            good: { bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.3)', text: '#86efac' },
            warning: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.4)', text: '#fbbf24' },
            bad: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.4)', text: '#f87171' }
        };
        const cc = consistencyColors[as.consistency] || consistencyColors.good;

        let statsHtml = `
            <div class="album-stats-box" style="padding:16px 20px;margin-bottom:16px;background:${cc.bg};border:1px solid ${cc.border};border-radius:12px;">
                <div style="font-size:16px;font-weight:700;color:${cc.text};margin-bottom:8px;">${as.consistencyText}</div>
                <div style="display:flex;flex-wrap:wrap;gap:16px;font-size:13px;color:#cbd5e1;">
                    <span>📊 Mediana: <strong style="color:#f1f5f9">${as.medianLufs} LUFS</strong></span>
                    <span>📈 Średnia: <strong style="color:#f1f5f9">${as.avgLufs} LUFS</strong></span>
                    <span>⬇️ Min: <strong style="color:#f1f5f9">${as.minLufs} LUFS</strong></span>
                    <span>⬆️ Max: <strong style="color:#f1f5f9">${as.maxLufs} LUFS</strong></span>
                    <span>↔️ Rozstęp: <strong style="color:#f1f5f9">${as.lufsRange} LUFS</strong></span>
                    <span>🎯 Idealny zakres: <strong style="color:#f1f5f9">${as.idealRange}</strong></span>
                </div>
                ${as.overallMsg ? `<div style="margin-top:8px;font-size:13px;color:#fbbf24;font-weight:500;">💡 ${as.overallMsg}</div>` : ''}
            </div>`;
        container.insertAdjacentHTML('afterbegin', statsHtml);
    }

    // ── Track rows with loudness status ──
    const statusStyles = {
        'ok': { color: '#4ade80', bg: 'rgba(34,197,94,0.15)', label: '✅ OK' },
        'too_loud': { color: '#ef4444', bg: 'rgba(239,68,68,0.15)', label: '🔴 ZA GŁOŚNO' },
        'too_quiet': { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', label: '🟠 ZA CICHO' },
        'album_inconsistent': { color: '#eab308', bg: 'rgba(234,179,8,0.15)', label: '🟡 NIERÓWNY' },
        'unknown': { color: '#64748b', bg: 'rgba(100,116,139,0.15)', label: '—' }
    };

    let html = data.tracks.map(t => {
        const ls = statusStyles[t.loudnessStatus] || statusStyles['unknown'];
        const lufsStyle = t.loudnessStatus === 'too_loud' ? 'color:#ef4444;font-weight:700;'
            : t.loudnessStatus === 'too_quiet' ? 'color:#f59e0b;font-weight:700;'
                : t.loudnessStatus === 'album_inconsistent' ? 'color:#eab308;font-weight:600;'
                    : '';
        const loudnessBadge = `<span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;color:${ls.color};background:${ls.bg};" title="${t.loudnessMsg || ''}">${ls.label}</span>`;
        const msgRow = t.loudnessMsg && t.loudnessStatus !== 'ok'
            ? `<div style="font-size:11px;color:${ls.color};margin-top:2px;opacity:0.85;">${t.loudnessMsg}</div>` : '';

        let verdictContent = `<div style="font-weight:600;white-space:nowrap;">${t.verdict}</div>`;
        if (t.issues && t.issues.length > 0) {
            const importantIssues = t.issues.filter(i => i.type === 'error' || i.type === 'warning');
            if (importantIssues.length > 0) {
                const issueList = importantIssues.map(i => {
                    const icon = i.type === 'error' ? '🔴' : '🟡';
                    const color = i.type === 'error' ? '#ef4444' : '#eab308';
                    return `<div style="font-size:10.5px;color:${color};margin-top:4px;line-height:1.2;white-space:normal;min-width:180px;">${icon} <strong style="opacity:0.9">${i.cat}</strong>: ${i.msg}</div>`;
                }).join('');
                verdictContent += `<div style="margin-top:6px;border-top:1px solid rgba(255,255,255,0.05);padding-top:4px;">${issueList}</div>`;
            }
        }

        return `<tr>
            <td>${t.filename}</td>
            <td style="${lufsStyle}">${t.lufs}</td>
            <td>${t.truePeak}</td>
            <td>${t.dr}</td>
            <td>${t.lra}</td>
            <td>${t.key}</td>
            <td>${t.tempo}</td>
            <td>${formatTime(t.duration)}</td>
            <td>${loudnessBadge}${msgRow}</td>
            <td style="vertical-align:top;">${verdictContent}</td>
        </tr>`;
    }).join('');

    if (data.errors && data.errors.length) {
        html += data.errors.map(e => `<tr class="batch-error-row"><td>${e.filename}</td><td colspan="8" style="color:#ef4444;">❌ Błąd: ${e.error}</td><td style="color:#ef4444;">Pominięto</td></tr>`).join('');
    }
    document.getElementById('batch-tbody').innerHTML = html;

    if (data.errors && data.errors.length) {
        const info = document.createElement('div');
        info.className = 'batch-info-box';
        info.style.cssText = 'padding:12px 16px;margin-top:12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;color:#fca5a5;font-size:14px;';
        info.textContent = `⚠️ ${data.errors.length} plik(ów) nie udało się przeanalizować. Sprawdź formaty i czy pliki nie są uszkodzone.`;
        container.appendChild(info);
    }
}

// ═══════ TABS ═══════
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
        setTimeout(() => Object.values(charts).forEach(c => c.resize()), 50);
    });
});

// ═══════ EXPORT ═══════
btnExportJson.addEventListener('click', () => {
    const dataContext = activeMode === 'batch' ? batchAnalysisData : analysisData;
    if (!dataContext) return;
    const blob = new Blob([JSON.stringify(dataContext, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    const fname = dataContext.filename ? dataContext.filename : 'album_batch';
    a.download = `sonariq_${fname.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    a.click();
});

btnExportPdf.addEventListener('click', async () => {
    const dataContext = activeMode === 'batch' ? batchAnalysisData : analysisData;
    if (!dataContext) return;
    btnExportPdf.disabled = true;
    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pw = pdf.internal.pageSize.getWidth();
        const ph = pdf.internal.pageSize.getHeight();
        const m = 15, cw = pw - 2 * m;

        // Helper: strip emoji (Helvetica can't render them)
        function clean(str) {
            if (!str) return '';
            return String(str).replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FEFF}]|[\u{1F900}-\u{1F9FF}]|[\u{200D}]|[\u{20E3}]|[\u{E0020}-\u{E007F}]|[\u2705\u274C\u26A0\u2139\u2B50\u2728\u26A1\u2714\u2717]/gu, '').trim();
        }

        // Helper: check page overflow
        let y = m;
        function checkPage(needed) {
            if (y + needed > ph - 15) {
                pdf.addPage();
                y = m;
            }
        }

        // ═══ HEADER ═══
        pdf.setFillColor(10, 10, 18);
        pdf.rect(0, 0, pw, 42, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(20);
        pdf.setTextColor(34, 197, 94); // Logo color
        pdf.text('Sonariq Mastering Analyzer', m, 18);
        pdf.setFontSize(10);
        pdf.setTextColor(50, 50, 50);
        pdf.text('Raport analizy audio - www.sonariq.eu', m, 26);
        pdf.setFontSize(8);

        if (activeMode === 'batch') {
            pdf.text('Tryb: Analiza Albumu (Batch)', m, 34);
            pdf.text('Zbadano utworow: ' + dataContext.tracks.length, m, 39);
            pdf.text('Data: ' + new Date().toLocaleString('pl-PL'), pw - m - 55, 34);
            y = 48;

            checkPage(20);
            pdf.setFontSize(14);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(10, 10, 10);
            pdf.text('Sprawozdanie ze spojnosci albumu', m, y);
            y += 8;

            pdf.setFontSize(9);
            dataContext.tracks.forEach((t, i) => {
                checkPage(45);
                pdf.setFillColor(245, 245, 245);
                pdf.rect(m, y, cw, 6, 'F');
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(10, 10, 10);
                pdf.text((i + 1) + '. ' + clean(t.filename), m + 2, y + 4);
                y += 10;

                pdf.setFont('helvetica', 'normal');
                pdf.setTextColor(40, 40, 40);
                pdf.text('LUFS: ' + t.lufs + ' | True Peak: ' + t.truePeak + ' | DR: ' + t.dr + ' | LRA: ' + t.lra, m + 2, y);
                y += 5;

                if (t.loudnessMsg) {
                    if (t.loudnessStatus === 'ok') pdf.setTextColor(20, 150, 50);
                    else pdf.setTextColor(200, 100, 0);
                    pdf.text('Glosnosc: ' + clean(t.loudnessMsg), m + 2, y);
                    y += 5;
                }

                if (t.issues && t.issues.length) {
                    t.issues.forEach(iss => {
                        checkPage(8);
                        if (iss.type === 'error') pdf.setTextColor(200, 40, 40);
                        else if (iss.type === 'warning') pdf.setTextColor(200, 100, 0);
                        else pdf.setTextColor(50, 50, 50);
                        pdf.text('  - [' + clean(iss.type).toUpperCase() + '] ' + clean(iss.cat) + ': ' + clean(iss.msg), m + 2, y);
                        y += 5;
                    });
                }

                y += 4;
            });

        } else {
            pdf.text('Plik: ' + clean(dataContext.filename), m, 34);
            pdf.text('Data: ' + new Date().toLocaleString('pl-PL'), pw - m - 55, 34);
            pdf.text('Czas trwania: ' + formatTime(dataContext.duration), pw - m - 55, 39);
            y = 48;

            // ═══ SUMMARY BOX ═══
            checkPage(45);
            pdf.setFillColor(245, 245, 245);
            pdf.roundedRect(m, y, cw, 42, 3, 3, 'F');
            pdf.setFontSize(12);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(10, 10, 10);
            pdf.text('Podsumowanie', m + 5, y + 8);

            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(30, 30, 30);
            const summaryRows = [
                ['Integrated LUFS: ' + analysisData.lufs.integrated, 'True Peak: ' + analysisData.truePeak.maxTruePeak + ' dBTP'],
                ['Dynamic Range: ' + analysisData.dynamics.drMeter + ' dB', 'Loudness Range: ' + analysisData.lufs.lra + ' LU'],
                ['Tonacja: ' + clean(analysisData.key.keyFull), 'Tempo: ' + analysisData.tempoChords.avgTempo + ' BPM'],
                ['Stereo korelacja: ' + analysisData.stereo.avgCorrelation, 'Clipping: ' + analysisData.truePeak.clipCount + ' pozycji'],
            ];
            summaryRows.forEach((row, i) => {
                pdf.text(row[0], m + 5, y + 16 + i * 6);
                pdf.text(row[1], m + cw / 2, y + 16 + i * 6);
            });
            y += 48;

            // ═══ QC VERDICT ═══
            checkPage(15);
            const verdict = clean(analysisData.qc.verdictText);
            pdf.setFontSize(11);
            pdf.setFont('helvetica', 'bold');
            if (analysisData.qc.verdict === 'pass') pdf.setTextColor(20, 150, 50);
            else if (analysisData.qc.verdict === 'warning') pdf.setTextColor(200, 100, 0);
            else pdf.setTextColor(200, 40, 40);
            pdf.text('Status QC: ' + verdict, m, y + 5);
            y += 12;

            // ═══ QC ISSUES ═══
            if (analysisData.qc.issues.length) {
                pdf.setFontSize(10);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(10, 10, 10);
                pdf.text('Problemy kontroli jakosci', m, y);
                y += 6;

                pdf.setFontSize(8);
                pdf.setFont('helvetica', 'normal');
                analysisData.qc.issues.forEach(iss => {
                    checkPage(6);
                    const prefix = iss.type === 'error' ? '[BLAD]' : iss.type === 'warning' ? '[OSTRZEZENIE]' : '[INFO]';
                    if (iss.type === 'error') pdf.setTextColor(200, 40, 40);
                    else if (iss.type === 'warning') pdf.setTextColor(200, 100, 0);
                    else pdf.setTextColor(50, 50, 50);
                    pdf.text('  ' + prefix + ' ' + clean(iss.cat) + ': ' + clean(iss.msg), m + 3, y);
                    y += 5;
                });
                y += 4;
            }

            // ═══ STREAMING TARGETS ═══
            checkPage(25);
            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(10, 10, 10);
            pdf.text('Zgodnosc z platformami streamingowymi', m, y);
            y += 6;

            const lufsVal = analysisData.lufs.integrated;
            const tpVal = analysisData.truePeak.maxTruePeak;
            const platforms = [
                { name: 'Spotify', lufs: -14, tp: -1 },
                { name: 'Apple Music', lufs: -16, tp: -1 },
                { name: 'YouTube', lufs: -14, tp: -1 },
                { name: 'Tidal', lufs: -14, tp: -1 },
            ];

            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'normal');
            platforms.forEach(p => {
                checkPage(5);
                const diff = Math.abs(lufsVal - p.lufs);
                const tpOk = tpVal <= p.tp;
                let status;
                if (diff <= 1 && tpOk) { pdf.setTextColor(20, 150, 50); status = 'OK'; }
                else if (diff <= 3 && tpOk) { pdf.setTextColor(200, 100, 0); status = 'Blisko (roznica: ' + diff.toFixed(1) + ' LUFS)'; }
                else { pdf.setTextColor(200, 40, 40); status = 'NIE (roznica: ' + diff.toFixed(1) + ' LUFS)'; }
                pdf.text('  ' + p.name + ' (target: ' + p.lufs + ' LUFS): ' + status, m + 3, y);
                y += 5;
            });
            y += 4;

            // ═══ AI TIPS ═══
            if (analysisData.aiTips && analysisData.aiTips.length) {
                checkPage(15);
                pdf.setFontSize(10);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(10, 10, 10);
                pdf.text('Rekomendacje', m, y);
                y += 6;

                pdf.setFontSize(8);
                pdf.setFont('helvetica', 'normal');
                analysisData.aiTips.forEach(tip => {
                    checkPage(10);
                    const title = clean(tip.title);
                    const msg = clean(tip.msg);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setTextColor(10, 10, 10);
                    pdf.text('  ' + title, m + 3, y);
                    y += 4;
                    pdf.setFont('helvetica', 'normal');
                    pdf.setTextColor(30, 30, 30);
                    const lines = pdf.splitTextToSize('  ' + msg, cw - 10);
                    lines.forEach(line => {
                        checkPage(4);
                        pdf.text(line, m + 3, y);
                        y += 4;
                    });
                    y += 2;
                });
            }

            // ═══ CHARTS (WYKRESY) ═══
            const chartKeys = [
                { id: 'lufs', title: 'LUFS w czasie' },
                { id: 'lufsHist', title: 'Histogram głośności' },
                { id: 'crest', title: 'Crest Factor' },
                { id: 'peak', title: 'True Peak w czasie' },
                { id: 'waveform', title: 'Waveform' },
                { id: 'avgSpectrum', title: 'Średnie widmo' },
                { id: 'bandBalance', title: 'Pasma widma' },
                { id: 'correlation', title: 'Korelacja Stereo L/R' },
                { id: 'width', title: 'Szerokość Stereo' },
                { id: 'msBalance', title: 'Balans Mid/Side' },
                { id: 'dynamics', title: 'Dynamika RMS vs Peak' },
                { id: 'chroma', title: 'Profil tonalny' },
                { id: 'tempo', title: 'Tempo w czasie' }
            ];

            for (let c of chartKeys) {
                if (charts[c.id]) {
                    checkPage(95);
                    pdf.setFontSize(10);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setTextColor(10, 10, 10);
                    pdf.text('Wykres: ' + clean(c.title), m, y);
                    y += 5;
                    try {
                        const img = charts[c.id].toBase64Image();
                        pdf.setFillColor(24, 24, 40); // Dark background for contrast since UI charts use white text
                        pdf.roundedRect(m, y, cw, 80, 2, 2, 'F');
                        pdf.addImage(img, 'PNG', m + 5, y + 5, cw - 10, 70);
                        y += 85;
                    } catch (e) { }
                }
            }

            const extraCanvas = [
                { id: 'canvas-heatmap', title: 'Spektrogram (Heatmap)' },
                { id: 'canvas-goniometer', title: 'Goniometr (Faza L/R)' }
            ];

            for (let ec of extraCanvas) {
                const el = document.getElementById(ec.id);
                if (el) {
                    checkPage(95);
                    pdf.setFontSize(10);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setTextColor(10, 10, 10);
                    pdf.text('Wykres: ' + clean(ec.title), m, y);
                    y += 5;
                    try {
                        const img = el.toDataURL('image/png');
                        pdf.setFillColor(24, 24, 40);
                        pdf.roundedRect(m, y, cw, 80, 2, 2, 'F');
                        pdf.addImage(img, 'PNG', m + Math.max(0, (cw - 120) / 2), y + Math.max(0, (80 - 60) / 2), Math.min(cw, 120), Math.min(80, 60));
                        y += 85;
                    } catch (e) { }
                }
            }

        } // <-- End of Active Mode Branching (Batch vs Single)

        // ═══ FOOTER on all pages ═══
        const totalPages = pdf.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            pdf.setPage(i);
            pdf.setFontSize(7);
            pdf.setTextColor(100, 116, 139);
            pdf.text('Sonariq - www.sonariq.eu - Strona ' + i + '/' + totalPages, pw / 2, ph - 8, { align: 'center' });
        }

        const fname = dataContext.filename ? dataContext.filename : 'album_batch';
        pdf.save('sonariq_raport_' + clean(fname).replace(/[^a-zA-Z0-9_-]/g, '_') + '.pdf');
    } catch (e) {
        console.error('PDF export error:', e);
        alert('Blad generowania PDF: ' + e.message);
    } finally {
        btnExportPdf.disabled = false;
    }
});
