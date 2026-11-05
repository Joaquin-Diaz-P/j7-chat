export function voiceDelivery(pending: boolean, active: boolean, model: boolean, imageBlocked: boolean, loading: boolean) {
 if(!pending)return 'none';
 if(active)return 'queued';
 if(loading)return 'wait';
 if(imageBlocked)return 'blocked-image';
 if(!model)return 'failed';
 return 'send';
}
