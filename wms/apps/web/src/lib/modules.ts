import { Boxes, ClipboardCheck, PackageSearch, Printer, ShieldCheck, Smartphone, Truck, Upload } from 'lucide-react';
import type { WmsModuleCard } from '../components/ModuleBoard';

export const mvpModules: WmsModuleCard[] = [
  {
    title: 'Роли и доступы',
    status: 'ready',
    icon: ShieldCheck,
    description: 'Bootstrap администратора, вход, Bearer token, роли и разрешения.',
  },
  {
    title: 'SKU и литраж',
    status: 'in-progress',
    icon: PackageSearch,
    description: 'Карточки товаров, штрихкоды, габариты и расчёт объёма в литрах.',
  },
  {
    title: 'Короба и паллеты',
    status: 'in-progress',
    icon: Boxes,
    description: 'Короб как основная единица хранения, паллеты и зоны склада.',
  },
  {
    title: 'Импорт XLSX',
    status: 'ready',
    icon: Upload,
    description: 'Предпросмотр и запись остатков, предпросмотр тарифных файлов.',
  },
  {
    title: 'Логистика',
    status: 'ready',
    icon: Truck,
    description: 'Наборы тарифов, направления, ступени и предварительный расчёт доставки.',
  },
  {
    title: 'ТСД offline',
    status: 'in-progress',
    icon: Smartphone,
    description: 'Native Kotlin приложение, device-login, Room outbox и batch sync API.',
  },
  {
    title: 'Печать TSC',
    status: 'ready',
    icon: Printer,
    description: 'Серверная генерация TSPL для этикеток коробов, SKU и паллет.',
  },
  {
    title: 'Приёмка и остатки',
    status: 'in-progress',
    icon: ClipboardCheck,
    description: 'Операции склада фиксируются через stock ledger, а не прямой перезаписью.',
  },
];
