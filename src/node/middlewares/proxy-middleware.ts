import type { NextHandleFunction } from "connect";
import * as HttpProxy from "http-proxy";
import * as colors from "picocolors";
import type { ProxyOptions } from "../../../types/ProxyOptions";


export function proxyMiddleware(proxyTable: Record<string, ProxyOptions | string>): NextHandleFunction {
	const proxies: Record<string, [HttpProxy, ProxyOptions]> = {};
	Object.keys(proxyTable).forEach(function (context) {
		let opts = proxyTable[context];
		if (!opts) {
			return;
		}
		if (typeof opts === 'string') {
			opts = { target: opts, changeOrigin: true };
		}
		let { rewrite, configure, bypass, ...proxyOptions } = opts;
		const proxy = HttpProxy.createProxyServer(proxyOptions);
		if (opts.configure) {
			opts.configure(proxy, opts);
		}
		proxy.on('error', (err, req, res) => {
			// When it is ws proxy, res is net.Socket
			// originalRes can be falsy if the proxy itself errored
			if (!res) {
				console.error(`${colors.red(`http proxy error: ${err.message}`)}\n${err.stack}`);
			} else if ('req' in res) {
				console.error(`${colors.red(`http proxy error at ${res.req.url}:`)}\n${err.stack}`);
				if (!res.headersSent && !res.writableEnded) {
					res
						.writeHead(500, {
							'Content-Type': 'text/plain',
						})
						.end();
				}
			} else {
				console.error(`${colors.red(`ws proxy error:`)}\n${err.stack}`);
				res.end();
			}
		});
		proxies[context] = [proxy, opts];
	});

	return function (req, res, next) {
		const url = req.url;
		for (const context in proxies) {
			if (doesProxyContextMatchUrl(context, url)) {
				const [proxy, opts] = proxies[context];
				const { rewrite, configure, bypass, ...proxyOptions } = opts;
				const options: HttpProxy.ServerOptions = {};

				if (bypass) {
					const bypassResult = bypass(req, res, proxyOptions);
					if (typeof bypassResult === 'string') {
						req.url = bypassResult;
						console.debug(`bypass: ${req.url} -> ${bypassResult}`);
						return next();
					} else if (typeof bypassResult === 'object') {
						Object.assign(options, bypassResult);
						console.debug(`bypass: ${req.url} use modified options: %O ` + JSON.stringify(options));
						return next();
					} else if (bypassResult === false) {
						console.debug(`bypass: ${req.url} -> 404`);
						return res.end(404);
					}
				}

				console.debug(`${req.url} -> ${opts.target || opts.forward}`);
				if (rewrite) {
					req.url = rewrite(req.url);
				}
				proxy.web(req, res, options);
				return;
			}
		}
		next();
	};
}
function doesProxyContextMatchUrl(context, url) {
	return (
		(context.charAt(0) === '^' && new RegExp(context).test(url)) ||
		url.startsWith(context)
	);
}
