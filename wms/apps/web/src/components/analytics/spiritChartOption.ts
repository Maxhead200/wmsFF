// FIX: visual adapter only; no aggregation, rounding or replacement of source amounts.
export function spiritChartOption(rows: ReadonlyArray<{ name: string; value: number }>) {
  return {
    animation: false,
    backgroundColor: 'transparent',
    textStyle: { fontFamily: 'Inter, system-ui, sans-serif', color: '#a6b4ce' },
    grid: { left: 8, right: 24, top: 12, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis' as const, renderMode: 'richText' as const, confine: true,
      backgroundColor: '#19263e', borderColor: '#33435d', textStyle: { color: '#edf2fc' } },
    xAxis: { type: 'value' as const, axisLabel: { color: '#a6b4ce' },
      splitLine: { lineStyle: { color: '#2b3952', type: 'dashed' as const } } },
    yAxis: { type: 'category' as const, inverse: true, data: rows.map(row => row.name),
      axisTick: { show: false }, axisLine: { show: false },
      axisLabel: { color: '#a6b4ce', width: 105, overflow: 'truncate' as const } },
    series: [{ type: 'bar' as const, barMaxWidth: 14, data: rows.map(row => row.value),
      itemStyle: { color: (params: { value: unknown }) => typeof params.value === 'number' && params.value < 0 ? '#f69ba7' : '#7de2c3', borderRadius: 3 } }],
  };
}
