// 极简事件总线：图鉴解锁、任务进度、引导、BGM 情绪都只通过它与玩法耦合。
export class Bus {
  constructor() {
    this._fns = {};
  }

  // 返回解绑函数，方便 const off = bus.on(...) 用完即弃
  on(type, fn) {
    (this._fns[type] || (this._fns[type] = [])).push(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    const list = this._fns[type];
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  emit(type, payload) {
    const list = this._fns[type];
    if (!list) return;
    for (const fn of [...list]) fn(payload);
  }
}
