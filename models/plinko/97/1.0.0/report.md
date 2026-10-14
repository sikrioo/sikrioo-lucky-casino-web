# plinko · variant 97 · v1.0.0

Target RTP 97.000% ± 0.50% — the tables the browser already uses. Result: **PASS**.

| combination | exact RTP | simulated RTP | 99% CI | hit rate | sd | max × |
| --- | --- | --- | --- | --- | --- | --- |
| 8 rows · low | 96.797% | 96.868% | 96.60% – 97.14% | 100.0% | 0.57 | 5.6 |
| 8 rows · mid | 97.109% | 97.289% | 96.66% – 97.91% | 100.0% | 1.32 | 13 |
| 8 rows · high | 96.875% | 96.453% | 95.21% – 97.70% | 100.0% | 2.67 | 29 |
| 12 rows · low | 96.763% | 96.803% | 96.44% – 97.17% | 100.0% | 0.77 | 10 |
| 12 rows · mid | 96.943% | 97.031% | 96.36% – 97.70% | 100.0% | 1.43 | 35 |
| 12 rows · high | 96.841% | 97.630% | 95.62% – 99.64% | 100.0% | 4.15 | 170 |
| 16 rows · low | 96.802% | 96.990% | 96.60% – 97.38% | 100.0% | 0.83 | 16 |
| 16 rows · mid | 97.003% | 96.987% | 96.13% – 97.84% | 100.0% | 1.82 | 110 |
| 16 rows · high | 96.700% | 96.407% | 93.57% – 99.24% | 100.0% | 6.07 | 1000 |

Checks: table shape · exact RTP within ±0.50% of 97.000% · Monte Carlo 300,000 rounds per combination within 4 SE of exact · max multiplier declared · deterministic replay.
