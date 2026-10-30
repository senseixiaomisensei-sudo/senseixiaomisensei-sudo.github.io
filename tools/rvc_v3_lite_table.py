"""Summarise tools/rvc_v3_lite_ab.py JSON results into markdown tables.

Usage: python tools/rvc_v3_lite_table.py OUT_DIR > table.md
"""
import json
import sys
from pathlib import Path


def f(v, nd=3):
    if v is None:
        return 'n/a'
    return f'{v:.{nd}f}'


def short(name):
    return name.split('___')[-1]


def main():
    out = Path(sys.argv[1])
    results = [json.loads(p.read_text(encoding='utf-8')) for p in sorted(out.glob('*__lite_ab.json'))]
    lines = []
    for key, title in (('post', '后处理 A/B —— 合成伪影替身（真值人声 + 元音门控 4.5–9.5 kHz 噪声 + 夸大齿音）'),
                       ('postSeparatedVocal', '后处理 A/B —— 真实分离人声（BS-RoFormer hyperace v2，无合成伪影）')):
        lines += [f'### {title}', '',
                  '| 片段 | 组 | HF超出参考 dB ↓ | HF平坦度 | 八度跳变率 ↓ | 粗音高误差 ↓ | 破音率 ↓ | 咔嗒/分 ↓ | 混音真峰值 dBTP | 削波比例 | 响度差 dB（对原曲）|',
                  '|---|---|---|---|---|---|---|---|---|---|---|']
        for r in results:
            if key not in r:
                continue
            for grp in ('A_legacy', 'B_v3'):
                m = r[key][grp]
                mix = m.get('mix', {})
                lines.append(f"| {short(r['name'])} | {grp} | {f(m.get('hfExcessDb'),2)} | {f(m.get('hfFlatness'))} | "
                             f"{f(m.get('octaveJumpRate'),4)} | {f(m.get('grossPitchError'),4)} | {f(m.get('breakupRate'),4)} | "
                             f"{f(m.get('clicksPerMinute'),1)} | {f(mix.get('truePeakDb'),2)} | {f(mix.get('clippedFraction'),5)} | "
                             f"{f(mix.get('loudnessDeltaDb'),2)} |")
            c = r[key].get('control_clean_in', {})
            if key == 'post':
                lines.append(f"| {short(r['name'])} | 对照：干净人声过收尾 | 改动能量 {f(c.get('diffRmsDbRelInput'),1)} dB（相对输入） | | | | | | | | |")
        lines.append('')
    lines += ['### F0 修复 A/B', '',
              '| 片段 | 注入（孤岛/尖刺）| 粗误差>600¢ A→B ↓ | >50¢ A→B ↓ | 八度跳变率 A→B ↓ | 干净轮廓误改帧 | 真实追踪：粗误差 A→B | 真实追踪：八度跳变率 A→B | 真实追踪修改帧 |',
              '|---|---|---|---|---|---|---|---|---|']
    for r in results:
        p = r['pitch']
        inj = p['injected']
        rt = p.get('realTracker', {})
        ra, rb = rt.get('A_tracked', {}), rt.get('B_repaired', {})
        lines.append(f"| {short(r['name'])} | {inj['islands']}/{inj['spikes']} | "
                     f"{f(p['A_corrupted']['grossErrorVsTruth'],4)}→{f(p['B_repaired']['grossErrorVsTruth'],4)} | "
                     f"{f(p['A_corrupted']['over50CentVsTruth'],4)}→{f(p['B_repaired']['over50CentVsTruth'],4)} | "
                     f"{f(p['A_corrupted']['octaveJumpRate'],4)}→{f(p['B_repaired']['octaveJumpRate'],4)} | "
                     f"{p['falseEditsOnClean']}/{p['cleanVoicedFrames']} | "
                     f"{f(ra.get('grossErrorVsTruth'),4)}→{f(rb.get('grossErrorVsTruth'),4)} | "
                     f"{f(ra.get('octaveJumpRate'),4)}→{f(rb.get('octaveJumpRate'),4)} | "
                     f"{rt.get('repairReport', {}).get('changedFrames', 'n/a')} |")
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
