import { useMemo } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts';
import { InventoryItem } from '@/src/types';
import { unitsByCategory, unitsByProgram } from '@/src/lib/inventoryStats';

const CATEGORY_COLORS = [
  '#861F41',
  '#E5751F',
  '#0d9488',
  '#6366f1',
  '#ca8a04',
  '#64748b',
  '#be185d',
  '#0f766e',
];

interface InventoryChartsProps {
  items: InventoryItem[];
}

export function InventoryCharts({ items }: InventoryChartsProps) {
  const pieData = useMemo(() => unitsByCategory(items).map((r) => ({ name: r.name, value: r.units })), [items]);
  const barData = useMemo(() => unitsByProgram(items), [items]);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-8 text-center text-sm text-slate-500">
        Add inventory to see category and program charts.
      </div>
    );
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="min-w-0 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
        <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">Units by category</h3>
        <p className="mb-2 text-xs text-slate-400">Total units grouped by category label</p>
        <div className="h-[260px] w-full min-h-[220px] min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={92}
                paddingAngle={2}
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => [`${v} units`, 'On hand']} />
              <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="min-w-0 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
        <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">Units by program</h3>
        <p className="mb-2 text-xs text-slate-400">Open-Hours pantry vs Grocery setup</p>
        <div className="h-[260px] w-full min-h-[220px] min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
            <BarChart data={barData} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="program" tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} />
              <Tooltip formatter={(v: number) => [`${v} units`, 'On hand']} />
              <Legend />
              <Bar dataKey="units" name="Units on hand" fill="#861F41" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
