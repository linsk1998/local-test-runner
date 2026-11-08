export interface TaskOptions {
	preset?: 'Chrome' | 'Firefox' | 'Safari' | 'Opera' | 'Edge' | 'EdgeIEMode' | 'IE';
	command?: string;
	url: string;
	flags?: string[];
	browser?: string;
	version?: string;
	/**
	 * 浏览器启动超时与测试执行超时（毫秒），默认 10000。
	 * 测试内容多的页面需要调大。
	 */
	timeout?: number;
}
