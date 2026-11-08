
import type { Server as ConnectServer } from "connect";
import type * as http from "http";
import type {
	OutgoingHttpHeaders as HttpServerHeaders
} from 'http';
import type * as HttpProxy from "http-proxy";
import type { ServerOptions as HttpsServerOptions } from 'https';


export interface Plugin {
	/**
	 * 自定义 HTML 加载：按访问路径返回 HTML 字符串。
	 * 返回非空字符串时直接使用该结果，跳过磁盘文件读取；
	 * 返回 null/undefined 时交给下一个插件或回退到文件系统。
	 * 支持异步。
	 */
	loadHtml?: LoadHtmlHook;
	transformHtml?: HtmlTransformHook;
	/**
	 * 服务器配置钩子：在内置中间件 use 之前调用，可在 ctx.middlewares
	 * （即 connect 返回的 app）上注册自定义中间件。
	 * 若返回一个函数，该函数会被收集，并在内置中间件 use 之后调用。
	 * 支持异步。
	 */
	configureServer?: ConfigureServerHook;
}

export interface ConfigureServerContext {
	/** connect 返回的 app（中间件容器） */
	middlewares: ConnectServer;
}

/** configureServer 返回的回调：内置中间件全部 use 之后执行 */
export type ConfigureServerPostHook = (
	ctx: ConfigureServerContext,
) => void | Promise<void>;

export type ConfigureServerHook = (
	ctx: ConfigureServerContext,
) => void | ConfigureServerPostHook | Promise<void | ConfigureServerPostHook>;

/**
 * @param url 请求的访问路径（含 querystring），如 "/tests/3.html?firefox=120"
 * @returns HTML 字符串，或 null/undefined 表示不处理（回退到文件系统）
 */
export type LoadHtmlHook = (
	url: string,
) => string | null | undefined | Promise<string | null | undefined>;

export type HtmlTransformHook = (
	html: string,
	ctx: {
		filename: string;
	},
) =>
	| HtmlTransformResult
	| void
	| Promise<HtmlTransformResult | void>;

type HtmlTransformResult =
	| string
	| HtmlTagDescriptor[]
	| {
		html: string;
		tags: HtmlTagDescriptor[];
	};

export interface HtmlTagDescriptor {
	tag: string;
	attrs?: Record<string, string>;
	children?: string | HtmlTagDescriptor[];
	/**
	 * 默认： 'head-prepend'
	 */
	injectTo?: 'head' | 'body' | 'head-prepend' | 'body-prepend';
}

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

export interface ServeOptions {
	/**
	 * 服务器根目录
	 * 
	 * 服务器根目录，所有请求都会从该目录下提供文件。
	 * 
	 * @default process.cwd()
	 */
	root?: string;
	/**
	 * 服务器监听地址
	 * 
	 * 指定服务器应该监听哪个 IP 地址。
	 * 设置为 `undefined` 将监听所有地址，包括局域网和公网地址。
	 * 
	 * @example 'localhost'
	 * @example '0.0.0.0'
	 * @example '192.168.1.100'
	 */
	host?: string;
	/**
	 * 服务器端口号
	 * 
	 * 开发服务器监听的端口。
	 * 如果端口被占用，不会自动尝试其他端口。
	 * 
	 * @default 80
	 */
	port?: number;
	/**
	 * HTTPS 配置
	 * 
	 * 启用 HTTPS 服务器。
	 * - `true`：使用自签名证书
	 * - 字符串：证书文件路径
	 * 
	 * @default false
	 * @example true
	 * @example { key: './key.pem', cert: './cert.pem' }
	 */
	https?: boolean | HttpsServerOptions;
	/**
	 * 启用 CORS
	 * 
	 * 为开发服务器启用 Cross-Origin Resource Sharing。
	 * @todo 未完成
	 * 
	 * @default true
	 */
	cors?: boolean;
	/**
	 * 服务器上下文路径（二级目录）
	 * 
	 * 服务器的二级目录路径，必须以 `/` 开头和结尾。
	 * 如果 `base` 配置以 `/` 开头和结尾，默认值为 `base`。
	 * 
	 * @default '/'
	 * @example '/my-app/'
	 */
	contextPath?: string;
	/**
	 * 代理配置
	 * 
	 * 为开发服务器配置自定义代理规则。
	 * 期望接收一个 `{ key: options }` 对象。
	 * 任何以 key 值开头的请求将被代理到对应的目标。
	 * 
	 * @see {@link https://github.com/http-party/node-http-proxy | 使用方式}
	 * @see {@link https://github.com/http-party/node-http-proxy#options | 完整配置}
	 * @example
	 * ```js
	 * module.exports = {
	 *   proxy: {
	 *     // string shorthand
	 *     '/foo': 'http://localhost:4567/foo',
	 *     // with options
	 *     '/api': {
	 *       target: 'http://jsonplaceholder.typicode.com',
	 *       changeOrigin: true,
	 *       rewrite: path => path.replace(/^\/api/, '')
	 *     }
	 *   }
	 * }
	 * ```
	 */
	proxy?: Record<string, string | ProxyOptions>;
	/**
	 * Specify server response headers.
	 */
	headers?: HttpServerHeaders;
	/** Transform HTML (deprecated, use `plugins` instead) */
	htmlTransformers?: HtmlTransformHook[];
	/** Plugin system */
	plugins?: Plugin[];
}
