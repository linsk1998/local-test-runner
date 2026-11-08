import type { TaskOptions } from "../../types/TaskOptions";
import type { TestResult } from "../../types/TestResult";
import { run } from "./run";

export function runQueue(tasks: TaskOptions[]): Promise<PromiseSettledResult<TestResult>[]> {
	if (tasks.length) {
		let [task, ...rest] = tasks;
		return new Promise<void>((resolve) => {
			setTimeout(() => {
				resolve();
			}, 200);
		}).then(() => {
			return runNext(task, rest);
		});
	} else {
		return Promise.resolve([]);
	}
}

function runNext(task: TaskOptions, tasks: TaskOptions[]): Promise<PromiseSettledResult<TestResult>[]> {
	var r: PromiseSettledResult<TestResult>;
	return run(task).then(function (result) {
		r = { status: "fulfilled", value: result };
		return runQueue(tasks);
	}, function (err) {
		// 单个任务失败（浏览器启动失败/超时）不中断队列，
		// 错误以 { status: "rejected", reason } 记入结果，继续后面的任务
		r = { status: "rejected", reason: err };
		return runQueue(tasks);
	}).then(function (results) {
		results.unshift(r);
		return results;
	});
}
