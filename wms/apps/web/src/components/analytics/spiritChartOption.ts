// FIX: visual adapter only; no aggregation, rounding or replacement of source amounts.
export function spiritChartOption(rows: ReadonlyArray<{ name: string; value: number }>) {
  return {
    animation: false,
    backgroundColor: 'transparent',
    textStyle: { fontFamily: 'Inter, system-ui, sans-serif', color: '#625d56' },
    grid: { left: 8, right: 24, top: 12, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis' as const, renderMode: 'richText' as const, confine: true,
      backgroundColor: '#fcfaf6', borderColor: '#d6cfc4', textStyle: { color: '#302e2b' } },
    xAxis: { type: 'value' as const, axisLabel: { color: '#625d56' },
      splitLine: { lineStyle: { color: '#ded6ca', type: 'dashed' as const } } },
    yAxis: { type: 'category' as const, inverse: true, data: rows.map(row => row.name),
      axisTick: { show: false }, axisLine: { show: false },
      axisLabel: { color: '#625d56', width: 105, overflow: 'truncate' as const } },
    series: [{ type: 'bar' as const, barMaxWidth: 14, data: rows.map(row => row.value),
      itemStyle: { color: (params: { value: unknown }) => typeof params.value === 'number' && params.value < 0 ? '#a53d38' : '#28654b', borderRadius: 3 } }],
  };
}
