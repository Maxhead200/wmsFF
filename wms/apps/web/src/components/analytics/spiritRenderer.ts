import { init, use } from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

// FIX: load only the bar chart and Canvas modules, and only when Spirit needs them.
use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);
export { init };
