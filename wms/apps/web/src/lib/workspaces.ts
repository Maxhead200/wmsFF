import {
  Boxes,
  Calculator,
  ClipboardList,
  Database,
  FolderCog,
  LayoutDashboard,
  Printer,
  ShieldCheck,
  Truck,
  Upload,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AuthUser } from './api';

export type WorkspaceId =
  | 'overview'
  | 'access'
  | 'directories'
  | 'imports'
  | 'logistics'
  | 'warehouse'
  | 'requests'
  | 'billing'
  | 'print'
  | 'data';

export type WorkspaceNavItem = {
  id: WorkspaceId;
  title: string;
  eyebrow: string;
  description: string;
  permissions: string[];
  icon: LucideIcon;
  status: 'ready' | 'in-progress' | 'planned';
};

export const workspaceNav: WorkspaceNavItem[] = [
  {
    id: 'overview',
    title: 'Обзор',
    eyebrow: 'Рабочий стол',
    description: 'Быстрый переход к доступным рабочим зонам WMS.',
    permissions: [],
    icon: LayoutDashboard,
    status: 'ready',
  },
  {
    id: 'access',
    title: 'Доступы',
    eyebrow: 'Администрирование',
    description: 'Пользователи, роли, клиентские scope и ТСД-устройства.',
    permissions: ['users:read', 'users:write'],
    icon: ShieldCheck,
    status: 'ready',
  },
  {
    id: 'directories',
    title: 'Справочники',
    eyebrow: 'Клиенты и SKU',
    description: 'Клиенты, товары, штрихкоды, габариты и литраж.',
    permissions: ['clients:read', 'clients:write', 'skus:read', 'skus:write'],
    icon: FolderCog,
    status: 'in-progress',
  },
  {
    id: 'warehouse',
    title: 'Склад',
    eyebrow: 'Операции',
    description: 'Короба, перемещения и текущая складская работа.',
    permissions: ['warehouse:read', 'warehouse:write', 'stock:read', 'stock:write'],
    icon: Boxes,
    status: 'in-progress',
  },
  {
    id: 'requests',
    title: 'Заявки',
    eyebrow: 'Клиентский контур',
    description: 'Заявки клиентов, статусы и операционный workflow.',
    permissions: ['client-requests:read', 'client-requests:write', 'client-requests:status'],
    icon: ClipboardList,
    status: 'in-progress',
  },
  {
    id: 'imports',
    title: 'Импорт',
    eyebrow: 'XLSX',
    description: 'Загрузка остатков и тарифов через предварительную проверку.',
    permissions: ['imports:write'],
    icon: Upload,
    status: 'ready',
  },
  {
    id: 'logistics',
    title: 'Логистика',
    eyebrow: 'Тарифы',
    description: 'Расчет доставки по направлениям и наборам тарифов.',
    permissions: ['logistics:read', 'logistics:write'],
    icon: Truck,
    status: 'ready',
  },
  {
    id: 'billing',
    title: 'Биллинг',
    eyebrow: 'Финансы',
    description: 'Услуги, хранение, начисления, счета и оплаты.',
    permissions: ['billing:read', 'billing:write'],
    icon: Calculator,
    status: 'in-progress',
  },
  {
    id: 'print',
    title: 'Печать',
    eyebrow: 'Этикетки',
    description: 'TSPL-preview для коробов и подготовка печатных потоков.',
    permissions: ['print:write'],
    icon: Printer,
    status: 'ready',
  },
  {
    id: 'data',
    title: 'Данные',
    eyebrow: 'Контроль',
    description: 'Таблицы остатков, клиентов, SKU и очередь разбора ТСД.',
    permissions: ['clients:read', 'skus:read', 'stock:read'],
    icon: Database,
    status: 'ready',
  },
];

export function canOpenWorkspace(user: AuthUser, item: WorkspaceNavItem) {
  if (item.permissions.length === 0 || user.permissionCodes.includes('system:admin')) {
    return true;
  }

  return item.permissions.some((permission) => user.permissionCodes.includes(permission));
}
