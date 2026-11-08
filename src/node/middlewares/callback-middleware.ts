import type { NextHandleFunction } from "connect";
import * as querystring from "querystring";
import { testEndEmitter, testStartEmitter } from "../task";

export function callMiddleware(): NextHandleFunction {
	return function (req, res, next) {
		if (req.method === "GET") {
			const protocol = (req.socket as any)?.encrypted ? 'https' : 'http';
			const host = req.headers.host;
			const fullUrl = `${protocol}://${host}${req.originalUrl}`;
			testStartEmitter.emit(fullUrl);
		} else if (req.method === "POST") {
			if (req.url === "/") {
				let body = '';
				req.on('data', (chunk: Buffer) => {
					body += chunk.toString();
				});
				req.on('end', () => {
					// 保持原始 querystring 对象直接下发；
					// 字段归一化（数字转换 + failN → failureDetails）统一在 run() 的 toTestResult 里做
					const data = querystring.parse(body);
					let referer = req.headers.referer;
					res.statusCode = 200;
					res.setHeader('Content-Type', 'text/html');
					res.end('<html><body><script>window.close()</script><body></html>');
					setTimeout(() => {
						testEndEmitter.emit(referer, data);
					}, 1000);
				});
				return;
			}
		}
		next();
	};
}
