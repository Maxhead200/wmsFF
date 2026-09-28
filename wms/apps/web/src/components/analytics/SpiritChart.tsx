import { useEffect, useRef } from 'react';
import { spiritChartOption } from './spiritChartOption';

// FIX: lazy Canvas renderer, reusing the existing product selection and exact amounts.
export function SpiritChart({ rows, onSelect }: {
  rows: Array<{ name: string; value: number }>;
  onSelect: (index: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef({ rows, onSelect });
  latest.current = { rows, onSelect };
  const chart = useRef<import('echarts/core').ECharts>();
  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    let instance: import('echarts/core').ECharts | undefined;
    void import('./spiritRenderer')
      .then(core => {
        if (cancelled || !host.current) return;
        instance = core.init(host.current, undefined, { renderer: 'canvas' });
        chart.current = instance;
        instance.setOption(spiritChartOption(latest.current.rows));
        instance.on('click', params => {
          if (params.componentType === 'series' && typeof params.dataIndex === 'number') latest.current.onSelect(params.dataIndex);
        });
        observer = new ResizeObserver(() => instance?.resize());
        observer.observe(host.current);
      }).catch(() => { /* The accessible product list remains available if the chart cannot load. */ });
    return () => { cancelled = true; observer?.disconnect(); instance?.dispose(); chart.current = undefined; };
  }, []);
  useEffect(() => { chart.current?.setOption(spiritChartOption(rows), { notMerge: true }); }, [rows]);
  return <div className="spirit-chart" ref={host} aria-hidden="true" />;
}
