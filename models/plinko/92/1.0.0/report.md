# plinko · variant 92 · v1.0.0

Target RTP 92.000% ± 0.50%. Result: **PASS**.

| combination | exact RTP | simulated RTP | 99% CI | hit rate | sd | max × |
| --- | --- | --- | --- | --- | --- | --- |
| 8 rows · low | 92.000% | 91.837% | 91.58% – 92.09% | 100.0% | 0.54 | 5.36 |
| 8 rows · mid | 91.984% | 91.752% | 91.16% – 92.34% | 100.0% | 1.27 | 12.5 |
| 8 rows · high | 91.977% | 91.711% | 90.52% – 92.90% | 100.0% | 2.54 | 27.6 |
| 12 rows · low | 92.000% | 92.002% | 91.65% – 92.35% | 100.0% | 0.74 | 9.62 |
| 12 rows · mid | 91.999% | 92.068% | 91.43% – 92.71% | 100.0% | 1.36 | 33.3 |
| 12 rows · high | 91.991% | 92.443% | 90.53% – 94.35% | 100.0% | 3.96 | 162 |
| 16 rows · low | 92.000% | 91.929% | 91.56% – 92.30% | 100.0% | 0.79 | 15.3 |
| 16 rows · mid | 91.999% | 92.307% | 91.49% – 93.13% | 100.0% | 1.73 | 104 |
| 16 rows · high | 91.999% | 91.057% | 88.24% – 93.87% | 100.0% | 5.79 | 955 |

Checks: table shape · exact RTP within ±0.50% of 92.000% · Monte Carlo 300,000 rounds per combination within 4 SE of exact · max multiplier declared · deterministic replay.
