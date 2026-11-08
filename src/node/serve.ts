import * as connect from "connect";
import type { Server } from "http";
import * as colors from "picocolors";
import * as serveStatic from "serve-static";
import type { ConfigureServerContext, ConfigureServerHook, ConfigureServerPostHook, ServeOptions } from "../../types/ServeOptions";
import { callMiddleware } from "./middlewares/callback-middleware";
import { htmlMiddleware } from "./middlewares/html-middleware";
import { proxyMiddleware } from "./middlewares/proxy-middleware";
import { queryMiddleware } from "./middlewares/query-middleware";


// 禁缓存响应头：测试服务器每次都应返回最新构建产物。
// no-store 只能阻止新的缓存写入，浏览器已存在的缓存条目不受影响，
// 需要彻底干净的场合配合浏览器的空缓存目录（见 run.ts 的 Chrome preset）。
const DEFAULT_HEADERS: Record<string, string> = {
	"Cache-Control": "no-store",
	"Pragma": "no-cache",
	"Expires": "0"
};

export async function serve(options: ServeOptions = {}): Promise<Server> {
	const resolvedOptions = {
		root: process.cwd(),
		port: 80,
		host: "localhost",
		https: false,
		contextPath: "/",
		...options
	};
	const { root, port, host, https, cors, contextPath, proxy, plugins, headers } = resolvedOptions;

	const htmlTransformers = resolvedOptions.htmlTransformers
		|| (plugins && plugins.map(p => p.transformHtml).filter(Boolean) as any);
	const loadHtmlHooks = plugins && plugins.map(p => p.loadHtml).filter(Boolean) as any;

	let app = connect();

	// configureServer：内置中间件 use 之前运行（支持异步）。
	// 返回的函数被收集，等内置中间件 use 完之后再依次运行。
	const configureServerHooks = plugins && plugins.map(p => p.configureServer).filter(Boolean) as ConfigureServerHook[];
	const ctx: ConfigureServerContext = { middlewares: app };
	const postHooks: ConfigureServerPostHook[] = [];
	if (configureServerHooks) {
		for (const hook of configureServerHooks) {
			const result = await hook(ctx);
			if (typeof result === "function") {
				postHooks.push(result);
			}
		}
	}

	// 响应头：默认禁缓存，headers 选项可覆盖/追加同名头以外的自定义头
	const mergedHeaders = Object.assign({}, DEFAULT_HEADERS, headers);
	app.use(function (_req, res, next) {
		for (const key in mergedHeaders) {
			res.setHeader(key, mergedHeaders[key]);
		}
		next();
	});
	if (proxy) {
		app.use(proxyMiddleware(proxy));
	}
	app.use(queryMiddleware());
	app.use(callMiddleware());
	app.use(contextPath, htmlMiddleware(root, htmlTransformers, loadHtmlHooks));
	app.use(contextPath, serveStatic(root, { index: ['index.html'] }));

	// configureServer 返回的回调：内置中间件 use 之后运行（支持异步）
	for (const hook of postHooks) {
		await hook(ctx);
	}

	return new Promise<Server>((resolve, reject) => {
		let httpServer = app.listen(port, host, function (error) {
			if (error) {
				reject(error);
				return;
			}
			let fullUrl = (https ? "https" : "http") + "://" + (host || "localhost") + ":" + port + contextPath;
			console.info(`Server is running at ${colors.cyan(fullUrl)}`);
			resolve(httpServer);
		});
	});
}
