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

/**
 * 裁断是否通过：没有任何任务被拒绝、且每个已完成任务的用例全部通过（且至少跑了 1 条）时为 true。
 *
 * 用 some + 取反，而不是 every：
 *  - some 在空数组上返回 false，取反后为 true，空队列视为通过（不跑 = 不失败）；
 *  - 语义上即"不存在失败项"，比"所有项都通过"更贴合"不中断队列"的整体判定。
 *
 * 入支持嵌套数组（如多次 runQueue 的结果合并），内部会先扁平化。
 */
export function judge(results: MultiTestResult): boolean {
	var list = flattenResults(results);
	return !list.some(function (settled) {
		if (settled.status !== "fulfilled") {
			return true;
		}
		return settled.value.total === 0 || settled.value.passed !== settled.value.total;
	});
}
