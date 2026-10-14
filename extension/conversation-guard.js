/* Route changes are not necessarily conversation changes. */
globalThis.PaperMarginsConversationGuard=class {
 constructor(path,baseline=[]){this.path=path;this.baseline=new Set(baseline);this.first=null;}
 check(path,users){
  if(!this.first){const first=users.find(t=>!this.baseline.has(t));if(!first)return 'waiting';this.first=first;this.path=path;return 'same';}
  if(path===this.path)return users.length?'same':'waiting';
  if(users.includes(this.first)){this.path=path;return 'same';}
  return users.length?'different':'waiting';
 }
};
