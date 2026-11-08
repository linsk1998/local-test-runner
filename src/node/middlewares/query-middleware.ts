import type { NextHandleFunction } from "connect";
import * as querystring from "querystring";

export function queryMiddleware(): NextHandleFunction {
	return function(req, res, next) {
		let url = req.originalUrl;
		if(url) {
			var index = url.indexOf("?");
			if(index >= 0) {
				req.url = url.substring(0, index);
				req.query = querystring.parse(url.substring(index + 1));
			}
		}
		next();
	};
}
