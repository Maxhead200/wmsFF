// FIX: opt-in ordinary WB picking; marked and SOS workflows remain unchanged.
export const ordinaryUnmarkedPickEnabled = () => process.env.WMS_FBS_UNMARKED_PICK_CLOSE_ENABLED === 'true';
type Pick = { marketplace?: string; requiresKiz?: boolean; kiz?: string | null; barcode?: string | null; sourceBoxPending?: boolean; deviceCode?: string; status: string };
export function isOrdinaryUnmarkedPick(task: Pick) {
  return ordinaryUnmarkedPickEnabled() && task.marketplace === 'WILDBERRIES' && task.requiresKiz === false &&
    !task.kiz && !task.sourceBoxPending && !!task.barcode && !!task.deviceCode &&
    !task.deviceCode.startsWith('SOS-WB:') && !task.deviceCode.startsWith('AUTO:');
}
export function ordinaryPickStatusLabel(task: Pick, fallback: string) {
  if (!isOrdinaryUnmarkedPick(task)) return fallback;
  return task.status === 'COMPLETED' ? 'Упаковано' : task.status === 'IN_PROGRESS' ? 'Найдено' : fallback;
}
