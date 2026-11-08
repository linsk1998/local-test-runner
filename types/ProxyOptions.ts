import type * as http from "http";
import type * as HttpProxy from "http-proxy";

export interface ProxyOptions extends HttpProxy.ServerOptions {
	/**
	 * 地址重写规则
	 */
	rewrite?: (path: string) => string;
	/**
	 * 自定义代理配置
	 */
	configure?: (proxy: HttpProxy, options: ProxyOptions) => void;
	/**
	 * webpack-dev-server 风格 bypass 函数
	 */
	bypass?: (
		req: http.IncomingMessage,
		res: http.ServerResponse,
		options: ProxyOptions
	) => void | null | undefined | false | string;
}
