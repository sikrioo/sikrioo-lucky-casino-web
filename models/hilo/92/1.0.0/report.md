# hilo · variant 92 · v1.0.0

Target RTP 92.000% ± 0.50%. Result: **PASS**.

| combination | exact RTP | simulated RTP | 99% CI | hit rate | sd | max × |
| --- | --- | --- | --- | --- | --- | --- |
| low only | 91.667% | 91.663% | 91.15% – 92.17% | 41.7% | 1.08 | 2.2 |
| seven only | 92.000% | 91.794% | 90.83% – 92.76% | 16.6% | 2.06 | 5.52 |
| high only | 91.667% | 91.594% | 91.08% – 92.10% | 41.6% | 1.08 | 2.2 |

Checks: table shape · exact RTP within ±0.50% of 92.000% · Monte Carlo 300,000 rounds per combination within 4 SE of exact · max multiplier declared · deterministic replay.
