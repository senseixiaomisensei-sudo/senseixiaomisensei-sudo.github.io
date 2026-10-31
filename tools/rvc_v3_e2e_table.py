"""Markdown table + per-stage verdicts for tools/rvc_v3_e2e.py results.json.

  python tools/rvc_v3_e2e_table.py OUT/results.json > table.md

A stage "passes" only if no case gets worse beyond the tolerance on any
metric AND at least one case improves by more than the tolerance on one.
Lower is better for every metric except voicingRecall.

Two verdicts are printed per stage:
* decision - the metrics that are valid on RVC output (RMVPE-based F0 error,
  breakup, voicing recall, HF excess, loudness, true peak, clipping);
* all metrics - additionally the autocorrelation octave-jump rate and the
  HF-transient click counter.  Both were shown to be unreliable on converted
  audio (the AC tracker locks onto vocoder harmonics; the click counter reads
  hundreds/min of vocoder noise on raw RVC output), so they are reported but
  do not decide a default.
"""
from __future__ import annotations

import json
import sys

# metric -> (tolerance, higher_is_better)
F0_METRICS = {
    'f0RmseCents': (2.0, False),
    'f0GrossRate': (.002, False),
    'f0OctaveErrRate': (.002, False),
    'rmvpeOctaveJumpRate': (.002, False),
    'octaveJumpRate': (.005, False),
    'breakupRate': (.005, False),
    'clicksPerMinute': (10.0, False),
    'voicingRecall': (.005, True),
}
POST_METRICS = {**F0_METRICS, 'hfExcessDb': (.1, False), 'hfNoiseP90Db': (.1, False)}
UNRELIABLE = ('octaveJumpRate', 'clicksPerMinute')  # informational on RVC output
DECISION_F0 = {k: v for k, v in F0_METRICS.items() if k not in UNRELIABLE}
DECISION_POST = {k: v for k, v in POST_METRICS.items() if k not in UNRELIABLE}
MASTER_METRICS = {'truePeakDb': (.05, False), 'clippedFraction': (1e-6, False), 'absLoudnessDeltaDb': (.1, False)}


def compare(a, b, metrics):
    worse, better = [], []
    for k, (tol, hib) in metrics.items():
        x, y = a.get(k), b.get(k)
        if x is None or y is None:
            continue
        d = (y - x) if not hib else (x - y)  # >0 means B is worse
        if k == 'clicksPerMinute':
            # the HF-transient counter sits at hundreds/min on raw RVC output
            # (vocoder noise); only a >5 % or >10/min change counts
            tol = max(tol, .05 * abs(x))
        if d > tol:
            worse.append(f'{k} {x:.4g}→{y:.4g}')
        elif d < -tol:
            better.append(f'{k} {x:.4g}→{y:.4g}')
    return worse, better


def fmt(v, nd=3):
    return '—' if v is None else (f'{v:.{nd}f}' if isinstance(v, float) else str(v))


def verdict(name, cases):
    worse = [(c, w) for c, w, _ in cases if w]
    better = [(c, b) for c, _, b in cases if b]
    ok = bool(not worse and better)
    lines = [f'**{name}: {"PASS" if ok else "FAIL" if worse else "NO EFFECT"}** '
             f'({len(cases)} cases, {len(worse)} worse, {len(better)} better)']
    for c, w in worse:
        lines.append(f'  * worse — {c}: ' + '; '.join(w))
    for c, b in better:
        lines.append(f'  * better — {c}: ' + '; '.join(b))
    return ok, '\n'.join(lines)


def two_verdicts(name, a_b_pairs, decision, full):
    """a_b_pairs: [(case, a, b)] -> (decision_ok, text)."""
    dec = [(c, *compare(a, b, decision)) for c, a, b in a_b_pairs]
    alls = [(c, *compare(a, b, full)) for c, a, b in a_b_pairs]
    ok, t1 = verdict(f'{name} — decision metrics', dec)
    ok2, t2 = verdict(f'{name} — all metrics incl. AC oct-jump/clicks (informational)', alls)
    return ok, dec, t1 + '\n\n' + t2


def main(path):
    res = json.load(open(path))
    out = ['# RVC v3 end-to-end A/B (real RVC conversion, CPU ONNX)', '',
           'Lower is better except voicingRecall. f0* = RMVPE on the converted vocal vs RMVPE(clean stem)·2^(shift/12).', '']
    verdicts = {}
    # F0 arms
    out += ['## F0 arms (each a separate RVC conversion)', '',
            '| case | arm | f0 RMSE ¢ | gross >600¢ | octave err | RMVPE oct-jump | AC oct-jump | breakup | clicks/min | voicing recall | frames changed |',
            '|---|---|---|---|---|---|---|---|---|---|---|']
    stage_cases = {'fix2 (OCTAVE_FIX r2)': [], 'fix1 (OCTAVE_FIX r1)': [], 'injfix2 (positive control)': [],
                   'hi_fix2 (OCTAVE_FIX r2, +12 st)': []}
    for tag, row in res.items():
        f = row['f0']
        rep = row['repair']
        changed = {'raw': 0, 'fix2': rep['fix2'].get('changedFrames'), 'fix1': rep['fix1'].get('changedFrames'),
                   'inj': len(rep.get('injectedAt') or []) * 8, 'injfix2': (rep.get('injfix2') or {}).get('changedFrames'),
                   'hi_raw': 0, 'hi_fix2': rep['fix2'].get('changedFrames')}
        for arm, m in f.items():
            out.append(f"| {tag} | {arm} | {fmt(m.get('f0RmseCents'),1)} | {fmt(m.get('f0GrossRate'),4)} | "
                       f"{fmt(m.get('f0OctaveErrRate'),4)} | {fmt(m.get('rmvpeOctaveJumpRate'),4)} | {fmt(m.get('octaveJumpRate'),4)} | "
                       f"{fmt(m.get('breakupRate'),4)} | {fmt(m.get('clicksPerMinute'),1)} | {fmt(m.get('voicingRecall'),4)} | {fmt(changed.get(arm))} |")
        for key, a, b in (('fix2 (OCTAVE_FIX r2)', 'raw', 'fix2'), ('fix1 (OCTAVE_FIX r1)', 'raw', 'fix1'),
                          ('injfix2 (positive control)', 'inj', 'injfix2'), ('hi_fix2 (OCTAVE_FIX r2, +12 st)', 'hi_raw', 'hi_fix2')):
            if a in f and b in f:
                stage_cases[key].append((tag, f[a], f[b]))
    out.append('')
    for key, cases in stage_cases.items():
        if cases:
            ok, dec, text = two_verdicts(key, cases, DECISION_F0, F0_METRICS)
            verdicts[key] = dict(passed=ok, worse=sum(1 for _, w, _ in dec if w), better=sum(1 for _, _, b in dec if b), cases=len(dec))
            out += [text, '']
    # post arms
    out += ['## Finishing arms on the converted vocal', '',
            '| case | base | arm | HF excess dB | HF p90 dB | flatness | f0 RMSE ¢ | gross | RMVPE oct-jump | AC oct-jump | clicks/min | blocks cut | change dB |',
            '|---|---|---|---|---|---|---|---|---|---|---|---|---|']
    post_cases = {k: [] for k in ('deess2', 'harsh2', 'finish2', 'finish1')}
    for tag, row in res.items():
        for base, arms in row['post'].items():
            for arm, m in arms.items():
                r = m.get('report') or {}
                cut = r.get('deessBlocks', 0) + r.get('harshBlocks', 0) if r else (r.get('deessFrames', 0) if r else 0)
                if r and 'deessFrames' in r:
                    cut = r.get('deessFrames', 0) + r.get('harshFrames', 0)
                out.append(f"| {tag} | {base} | {arm} | {fmt(m.get('hfExcessDb'),2)} | {fmt(m.get('hfNoiseP90Db'),2)} | {fmt(m.get('flatness'),4)} | "
                           f"{fmt(m.get('f0RmseCents'),1)} | {fmt(m.get('f0GrossRate'),4)} | {fmt(m.get('rmvpeOctaveJumpRate'),4)} | "
                           f"{fmt(m.get('octaveJumpRate'),4)} | {fmt(m.get('clicksPerMinute'),1)} | {cut if arm != 'none' else '—'} | "
                           f"{fmt(m.get('changeRmsDb'),1) if arm != 'none' else '—'} |")
                if arm != 'none':
                    post_cases[arm].append((f'{tag}/{base}', arms['none'], m))
    out.append('')
    for key, cases in post_cases.items():
        ok, dec, text = two_verdicts(key, cases, DECISION_POST, POST_METRICS)
        verdicts[key] = dict(passed=ok, worse=sum(1 for _, w, _ in dec if w), better=sum(1 for _, _, b in dec if b), cases=len(dec))
        out += [text, '']
    # master
    out += ['## Master on the mix (legacy = sum + uniform −1 dBTP trim; v3 = loudness match + limiter + same trim)', '',
            '| case | base | arm | LUFS | Δ vs original LU | true peak dBTP | clipped | clicks/min | gain dB |',
            '|---|---|---|---|---|---|---|---|---|']
    mcases = []
    for tag, row in res.items():
        for base, arms in row['master'].items():
            for arm, m in arms.items():
                m['absLoudnessDeltaDb'] = abs(m.get('loudnessDeltaDb', 0))
                out.append(f"| {tag} | {base} | {arm} | {fmt(m.get('integratedLufs'),2)} | {fmt(m.get('loudnessDeltaDb'),2)} | "
                           f"{fmt(m.get('truePeakDb'),2)} | {fmt(m.get('clippedFraction'),6)} | {fmt(m.get('clicksPerMinute'),1)} | "
                           f"{fmt((m.get('report') or {}).get('loudnessGainDb'),2) if arm == 'v3' else '—'} |")
            w, bt = compare(arms['legacy'], arms['v3'], MASTER_METRICS)
            mcases.append((f'{tag}/{base}', w, bt))
    out.append('')
    ok, text = verdict('master (LOUDNESS+LIMITER)', mcases)
    verdicts['master'] = dict(passed=ok, worse=sum(1 for _, w, _ in mcases if w), better=sum(1 for _, _, b in mcases if b), cases=len(mcases))
    out += [text, '']
    # combo: the RVC_V3=1 default chain vs legacy, end to end
    if any('combo' in r for r in res.values()):
        out += ['## Default chain end to end (RVC_V3=1 defaults vs legacy)', '',
                'legacy = raw conversion, no finishing, sum + −1 dBTP trim. '
                'v3 = OCTAVE_FIX r2 conversion → HARSH r2 → sum → loudness match + true-peak limiter → same trim.', '',
                '| case | base | chain | Δ loudness LU | true peak dBTP | clipped | f0 RMSE ¢ | gross | octave err | RMVPE oct-jump | breakup | voicing | HF excess dB | HF p90 dB |',
                '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|']
        combo_metrics = {**DECISION_POST, **MASTER_METRICS}
        ccases = []
        for tag, row in res.items():
            for base, c in (row.get('combo') or {}).items():
                leg = {**row['post'][base]['none'], **row['master'][base]['legacy']}
                v3 = {**c['vocal'], **c['mix']}
                for m in (leg, v3):
                    m['absLoudnessDeltaDb'] = abs(m.get('loudnessDeltaDb', 0))
                for name, m in (('legacy', leg), ('v3', v3)):
                    out.append(f"| {tag} | {base} | {name} | {fmt(m.get('loudnessDeltaDb'),2)} | {fmt(m.get('truePeakDb'),2)} | "
                               f"{fmt(m.get('clippedFraction'),6)} | {fmt(m.get('f0RmseCents'),1)} | {fmt(m.get('f0GrossRate'),4)} | "
                               f"{fmt(m.get('f0OctaveErrRate'),4)} | {fmt(m.get('rmvpeOctaveJumpRate'),4)} | {fmt(m.get('breakupRate'),4)} | "
                               f"{fmt(m.get('voicingRecall'),4)} | {fmt(m.get('hfExcessDb'),2)} | {fmt(m.get('hfNoiseP90Db'),2)} |")
                ccases.append((f'{tag}/{base}', leg, v3))
        out.append('')
        ok, dec, text = two_verdicts('default chain (RVC_V3=1)', ccases, combo_metrics,
                                     {**POST_METRICS, **MASTER_METRICS})
        verdicts['combo'] = dict(passed=ok, worse=sum(1 for _, w, _ in dec if w), better=sum(1 for _, _, b in dec if b), cases=len(dec))
        out += [text, '']
    out += ['## Verdicts', '', '```json', json.dumps(verdicts, indent=1), '```']
    print('\n'.join(out))


if __name__ == '__main__':
    main(sys.argv[1])
