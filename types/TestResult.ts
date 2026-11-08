export interface TestResult {
	passed: number;
	total: number;
	runtime: number;
	/** 失败断言总数（QUnit 插件上报） */
	failures?: number;
	/** 失败断言明细（测试名 :: 消息 (expected: X, actual: Y)），最多 50 条 */
	failureDetails?: string[];
}

export type QueueTestResult = PromiseSettledResult<TestResult>;

export type ParallelTestResult = PromiseSettledResult<TestResult | QueueTestResult>;

export type MultiTestResult = TestResult | TestResult[] | QueueTestResult | QueueTestResult[] | ParallelTestResult | ParallelTestResult[];
