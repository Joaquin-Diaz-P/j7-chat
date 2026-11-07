import type { CatalogSnapshot, SettingsData, SettingsSection } from '../shared/ipc.js';
export function setupSection({statuses,permissions,firstRun}:{statuses:CatalogSnapshot['statuses'];permissions:SettingsData['permissions'];firstRun:boolean}):SettingsSection | undefined {
 if(!Object.values(statuses).some(status=>status?.state==='ready'))return 'programs';
 if(firstRun && (!permissions.screen || !permissions.input))return 'permissions';
 return undefined;
}
