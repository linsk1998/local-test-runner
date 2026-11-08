import * as pc from "picocolors";
import type { TaskOptions } from "../../types/TaskOptions";
import type { MultiTestResult, TestResult } from "../../types/TestResult";

type SettledTestResult = PromiseSettledResult<TestResult>;

/**
 * 把 MultiTestResult 归一化为扁平的 settled 结果数组，支持任意层级：
 *  - 数组 → 逐项递归展开
 *  - settled 对象 → fulfilled 递归解包 value（可能是 TestResult、数组或再嵌套的 settled），
 *    rejected 原样保留（对应被拒绝的任务或整个 runQueue）
 *  - 普通 TestResult（无 status）→ 包装成 { status: "fulfilled", value }
 */
function flattenResults(input: MultiTestResult): SettledTestResult[] {
	if (Array.isArray(input)) {
		return input.reduce<SettledTestResult[]>(function (acc, item) {
			return acc.concat(flattenResults(item as MultiTestResult));
		}, []);
	}
	const node = input as any;
	if (node && (node.status === "fulfilled" || node.status === "rejected")) {
		if (node.status === "fulfilled") {
			return flattenResults(node.value as MultiTestResult);
		}
		return [node as SettledTestResult];
	}
	return [{ status: "fulfilled", value: node as TestResult }];
}

export interface ReportSummary {
	/** 任务总数 */
	tasks: number;
	/** 用例全部通过的任务数 */
	tasksPassed: number;
	/** 未通过的任务数（含用例失败与任务级错误） */
	tasksFailed: number;
	/** 任务级错误（浏览器启动失败/超时）数 */
	tasksErrored: number;
	/** 用例通过总数 */
	passed: number;
	/** 用例失败总数 */
	failed: number;
	/** 用例总数 */
	tests: number;
	/** 累计耗时（毫秒） */
	runtime: number;
}

/**
 * 输出测试结果：逐行汇总每个任务的通过情况与失败明细，末尾输出总计。
 * results 为 MultiTestResult（单个 TestResult、runQueue 的 settled 数组、并行 allSettled 结果等），
 * 内部统一扁平化；tasks 与扁平化后的结果按下标一一对应，用于显示浏览器名称/版本，缺省时以 Task#N 标识。
 * 返回统计对象供程序化使用。
 */
export function report(results: MultiTestResult, tasks?: TaskOptions[]): ReportSummary {
	var list = flattenResults(results);
	const summary: ReportSummary = {
		tasks: list.length,
		tasksPassed: 0,
		tasksFailed: 0,
		tasksErrored: 0,
		passed: 0,
		failed: 0,
		tests: 0,
		runtime: 0
	};
	if (!list.length) {
		console.log(pc.yellow("No test results."));
		return summary;
	}
	const lines: string[] = [];
	list.forEach(function (settled, index) {
		const task = tasks && tasks[index];
		const label = ((task && (task.browser || task.preset)) || "Task#" + (index + 1))
			+ (task && task.version ? " v" + task.version : "");
		if (settled.status === "fulfilled") {
			const result = settled.value;
			summary.passed += result.passed;
			summary.tests += result.total;
			summary.failed += result.total - result.passed;
			summary.runtime += result.runtime || 0;
			if (result.total === 0) {
				summary.tasksFailed++;
				lines.push(pc.yellow("⚠") + " " + pc.yellow(pc.bold(label + ":")) + " " + pc.yellow("0 tests executed"));
			} else if (result.passed === result.total) {
				summary.tasksPassed++;
				lines.push(
					pc.green("✓") + " " +
					pc.green(pc.bold(label + ":")) + " " +
					pc.green(result.passed + "/" + result.total + " passed") + " " +
					pc.dim("(" + result.runtime + "ms)")
				);
			} else {
				summary.tasksFailed++;
				lines.push(
					pc.red("✗") + " " +
					pc.red(pc.bold(label + ":")) + " " +
					pc.red(result.passed + "/" + result.total + " failed") + " " +
					pc.dim("(" + result.runtime + "ms)")
				);
			}
			appendFailureDetails(lines, result);
		} else {
			summary.tasksErrored++;
			summary.tasksFailed++;
			const reason = (settled.reason && settled.reason.message) || String(settled.reason);
			lines.push(pc.red("✗") + " " + pc.red(pc.bold(label + ":")) + " " + pc.red(String(reason)));
		}
	});
	console.log(lines.join("\n"));
	console.log(pc.dim("-".repeat(60)));
	console.log(
		"Total: " + summary.tasks + " tasks, " +
		summary.tasksPassed + " passed, " +
		summary.tasksFailed + " failed" +
		(summary.tasksErrored ? " (" + summary.tasksErrored + " errors)" : "") + ", " +
		summary.passed + "/" + summary.tests + " tests, " +
		summary.runtime + "ms"
	);
	return summary;
}

function appendFailureDetails(lines: string[], result: TestResult) {
	const details = result.failureDetails || [];
	for (let i = 0; i < details.length; i++) {
		lines.push(pc.red("    ✗ " + details[i]));
	}
	if (result.failures && result.failures > details.length) {
		lines.push(pc.red("    ... and " + (result.failures - details.length) + " more"));
	}
}
