# Local DRAW results

Compiler follow-up: [single-key Context specialization](COMPILER_KEYS.md) reduces the unchanged app’s confirmed median from 1,571.0 ms to 935.9 ms (40.4% less time), using compiler lowering plus a runtime intrinsic. The original matrix below predates this change.


Measured with the local build of `speculative-optimizations` at `7dbf94e47a524c44726e6265c42f668a2dbd3fa8`.

Apple M2 Max; 155.0.8059.40; headless Chrome. Screening: 2 warmups + 3 trials per distinct output. Independent finalist confirmation: 2 warmups + 9 trials.

242 valid configurations; 74 distinct generated outputs. 74 outputs passed all 5,000 synchronous commit checks, manual editing, final-state and normalized shape-DOM comparison; 0 verification failures.

## Context map

Lowest confirmed median: **context / lists + context** (`context-20`): **1495.4 ms**, IQR 1473.6–1515.6 ms.

Relative to compiler-only on the same local runtime: **1.06×**. Relative to compiler-off: **1.74×**.

| Configuration | Median ms | p25–p75 ms | Raw ms |
| --- | ---: | --- | --- |
| context / lists + context | 1495.4 | 1473.6–1515.6 | 1495.4, 1520.4, 1473.6, 1444.0, 1515.6, 1537.6, 1478.2, 1514.5, 1430.8 |
| context / lists + incremental | 1504.6 | 1497.6–1553.4 | 1504.6, 1499.4, 1553.4, 1450.3, 1530.0, 1561.3, 1497.6, 1584.7, 1457.6 |
| context / blocks + lists + incremental | 1520.8 | 1503.8–1593.2 | 1593.2, 1520.8, 1464.3, 1519.6, 1609.7, 1591.1, 1482.7, 1503.8, 1595.7 |
| context / blocks + islands | 1535.0 | 1517.8–1550.6 | 1535.0, 1461.0, 1550.6, 1629.7, 1539.4, 1585.2, 1517.8, 1485.4, 1527.9 |
| context / lists + islands | 1538.5 | 1492.8–1558.6 | 1562.3, 1456.2, 1475.0, 1551.6, 1585.2, 1538.5, 1492.8, 1500.1, 1558.6 |
| context / blocks + lists + incremental + context + slicing + islands | 1562.6 | 1538.2–1618.0 | 1723.1, 1611.4, 1560.6, 1562.6, 1656.2, 1618.0, 1538.2, 1486.1, 1529.4 |
| context / compiler only | 1582.6 | 1556.1–1587.6 | 1587.6, 1556.1, 1579.0, 1484.2, 1608.7, 1583.4, 1610.0, 1529.5, 1582.6 |
| context / compiler off | 2604.0 | 2510.9–2617.6 | 2617.6, 2612.5, 2625.9, 2480.1, 2604.0, 2632.5, 2561.0, 2490.4, 2510.9 |

Within 5% of this median: `context-12`, `context-14`, `context-130`, `context-132`, `context-222`. These are near-ties; do not interpret their rank as a reliable general advantage.

The following configurations generate byte-identical editor/adapter code and share this result: `context-21`, `context-52`, `context-53`. See the manifest for flags; enabling a no-op flag is not a separate speedup.

## Entity external store

Lowest confirmed median: **store / blocks + lists + incremental + context + slicing + islands** (`store-222`): **463.0 ms**, IQR 458.7–467.1 ms.

Relative to compiler-only on the same local runtime: **1.52×**. Relative to compiler-off: **2.28×**.

| Configuration | Median ms | p25–p75 ms | Raw ms |
| --- | ---: | --- | --- |
| store / blocks + lists + incremental + context + slicing + islands | 463.0 | 458.7–467.1 | 467.1, 463.0, 458.7, 460.2, 466.1, 481.8, 446.5, 474.3, 458.4 |
| store / blocks + lists + incremental + context | 464.2 | 452.9–468.4 | 449.0, 468.1, 451.6, 452.9, 468.4, 479.7, 475.1, 464.2, 461.6 |
| store / lists + incremental + context + islands | 469.5 | 463.4–472.1 | 475.6, 469.5, 463.4, 455.1, 470.4, 487.7, 463.3, 463.8, 472.1 |
| store / lists + incremental | 470.3 | 464.3–487.9 | 452.8, 464.3, 474.9, 456.6, 491.8, 487.9, 466.3, 488.6, 470.3 |
| store / lists + context + slicing + islands | 474.1 | 470.7–481.8 | 480.4, 470.7, 474.1, 455.0, 481.8, 471.1, 462.0, 492.8, 485.5 |
| store / lists + context + islands | 480.3 | 471.6–485.0 | 480.3, 477.5, 457.6, 456.6, 490.4, 499.0, 485.0, 471.6, 481.0 |
| store / compiler only | 705.4 | 691.4–725.5 | 681.7, 705.4, 725.5, 691.4, 725.4, 741.9, 695.7, 689.2, 737.0 |
| store / compiler off | 1053.7 | 1029.5–1062.9 | 1029.5, 1053.7, 1061.2, 1005.7, 1089.8, 1091.8, 989.1, 1032.1, 1062.9 |

Within 5% of this median: `store-30`, `store-156`, `store-12`, `store-212`, `store-148`. These are near-ties; do not interpret their rank as a reliable general advantage.

The following configurations generate byte-identical editor/adapter code and share this result: `store-223`, `store-254`, `store-255`. See the manifest for flags; enabling a no-op flag is not a separate speedup.

## Limits

This is the inferred 999-box + one-label logo trace, not the original DRAW recording. All numbers measure synchronous UI event dispatch, state work, React render/commit and GC. They exclude subsequent layout and paint. Context/store comparisons change architecture; compiler-only comparisons keep architecture and local runtime fixed. The matrix toggles compiler transformations while retaining runtime support for all experiments. A fastest median is specific to this workload/build/machine, and finalists were selected from a shorter screening run, not an exhaustive nine-trial run of every output.

Full raw samples, execution order, source/native/runtime hashes and compiler output are available in `results/` and `dist/manifest.json`. Read README.md for reproduction commands.

## Bottleneck investigation

See [PROFILING.md](PROFILING.md) for the separate diagnostic profiles and call counts explaining the modest Context gain.
