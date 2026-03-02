import io

with io.open('I:\\Analizator tempa utworu\\web\\app.py', 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

parts = content.split('def generate_ai_suggestions(results):')
if len(parts) == 2:
    start = parts[0]
    rest = parts[1]
    end_parts = rest.split('# ═══════════════════════════════════════════════════════════')
    
    new_func = """    tips=[]
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
"""

    new_content = start + 'def generate_ai_suggestions(results):\n' + new_func + '\n# ═══════════════════════════════════════════════════════════' + end_parts[1]
    with io.open('I:\\Analizator tempa utworu\\web\\app.py', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("SUCCESS")
