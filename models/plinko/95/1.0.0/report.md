# plinko · variant 95 · v1.0.0

Target RTP 95.000% ± 0.50%. Result: **PASS**.

| combination | exact RTP | simulated RTP | 99% CI | hit rate | sd | max × |
| --- | --- | --- | --- | --- | --- | --- |
| 8 rows · low | 95.000% | 95.003% | 94.74% – 95.27% | 100.0% | 0.56 | 5.57 |
| 8 rows · mid | 94.969% | 95.136% | 94.52% – 95.75% | 100.0% | 1.30 | 12.7 |
| 8 rows · high | 94.961% | 94.659% | 93.44% – 95.88% | 100.0% | 2.62 | 28.5 |
| 12 rows · low | 95.000% | 94.954% | 94.60% – 95.31% | 100.0% | 0.76 | 9.94 |
| 12 rows · mid | 94.999% | 95.224% | 94.56% – 95.89% | 100.0% | 1.41 | 34.4 |
| 12 rows · high | 94.994% | 95.838% | 93.84% – 97.84% | 100.0% | 4.10 | 168 |
| 16 rows · low | 95.000% | 95.037% | 94.65% – 95.42% | 100.0% | 0.82 | 15.7 |
| 16 rows · mid | 95.000% | 94.389% | 93.56% – 95.22% | 100.0% | 1.79 | 109 |
| 16 rows · high | 94.997% | 96.255% | 92.98% – 99.53% | 100.0% | 6.01 | 990 |

Checks: table shape · exact RTP within ±0.50% of 95.000% · Monte Carlo 300,000 rounds per combination within 4 SE of exact · max multiplier declared · deterministic replay.
