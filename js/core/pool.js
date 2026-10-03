// JavaScript は1ページで同時に1つのことしかできない。エンコードをそのまま実行すると
// その間ボタンも進捗バーも固まるため、別スレッド（Worker）に逃がす。
// UI用に1つ残し、残りを計算に充てる。
export function poolSize() {
  const cores = navigator.hardwareConcurrency || 4;
  return Math.max(1, Math.min(6, cores - 1));
}

export function createPool(workerUrl, size = poolSize()) {
  const idle = [];
  const queue = [];
  const pending = new Map();
  let nextId = 0;

  const spawn = () => {
    const worker = new Worker(workerUrl, { type: 'module' });
    worker.onmessage = (event) => {
      const { id, ok, result, error } = event.data;
      const task = pending.get(id);
      pending.delete(id);
      idle.push(worker);
      pump();
      if (!task) return;
      if (ok) task.resolve(result);
      else task.reject(new Error(error));
    };
    worker.onerror = (event) => {
      // Worker自体が落ちた場合、担当中のタスクが宙に浮くので明示的に失敗させる
      for (const [id, task] of pending) {
        if (task.worker === worker) {
          pending.delete(id);
          task.reject(new Error(event.message || 'Worker が異常終了しました'));
        }
      }
      // 落ちたWorkerを放置すると、メモリ不足などで数回落ちただけでプールが空になり、
      // 待機列が永久に進まなくなる（進捗バーが止まったまま戻らない）。必ず補充する。
      worker.terminate();
      idle.push(spawn());
      pump();
    };
    return worker;
  };

  for (let i = 0; i < size; i += 1) idle.push(spawn());

  function pump() {
    while (idle.length > 0 && queue.length > 0) {
      const worker = idle.pop();
      const task = queue.shift();
      const id = nextId;
      nextId += 1;
      task.worker = worker;
      pending.set(id, task);
      worker.postMessage({ id, file: task.file, settings: task.settings });
    }
  }

  return {
    size,
    run(file, settings) {
      return new Promise((resolve, reject) => {
        queue.push({ file, settings, resolve, reject });
        pump();
      });
    },
    // 実行中のものは止められない（Workerごと落とすしかない）ので、
    // 待機列にあるものだけ落とす。Worker自体は次のバッチで再利用する。
    cancel() {
      for (const task of queue.splice(0)) task.reject(new Error('中断されました'));
    },
    terminate() {
      this.cancel();
      for (const worker of idle) worker.terminate();
      idle.length = 0;
    },
  };
}
