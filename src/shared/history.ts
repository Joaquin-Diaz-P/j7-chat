export function historyGroup(chat: {pinned:boolean;updatedAt:number}, now=Date.now()) {
 if(chat.pinned)return 0;
 const today=new Date(now);today.setHours(0,0,0,0);
 const yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1);
 const week=new Date(today);week.setDate(week.getDate()-7);
 return chat.updatedAt>=+today?1:chat.updatedAt>=+yesterday?2:chat.updatedAt>=+week?3:4;
}
