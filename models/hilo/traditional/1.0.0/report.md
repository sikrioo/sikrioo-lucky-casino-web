# hilo · variant traditional · v1.0.0

Target RTP 83.330% ± 0.10% — classic 1:1 and 4:1. Result: **PASS**.

| combination | exact RTP | simulated RTP | 99% CI | hit rate | sd | max × |
| --- | --- | --- | --- | --- | --- | --- |
| low only | 83.333% | 83.280% | 82.82% – 83.74% | 41.6% | 0.99 | 2 |
| seven only | 83.333% | 83.522% | 82.64% – 84.40% | 16.7% | 1.86 | 5 |
| high only | 83.333% | 83.449% | 82.99% – 83.91% | 41.7% | 0.99 | 2 |

Checks: table shape · exact RTP within ±0.10% of 83.330% · Monte Carlo 300,000 rounds per combination within 4 SE of exact · max multiplier declared · deterministic replay.
