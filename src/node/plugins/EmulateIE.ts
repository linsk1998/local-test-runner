import * as qs from "querystring";
import type { Plugin } from "../../../types/ServeOptions";

// 按 ?ie=X 注入 X-UA-Compatible，配合 EdgeIEMode preset（msedge --ie-mode-test）
// 让页面在指定 IE 文档模式下渲染。注意必须用 http-equiv，name 会被 IE 忽略。
export var EmulateIE: Plugin = {
	transformHtml(html, ctx) {
		var params = qs.parse(ctx.filename.split('?')[1] || '');
		if (params.ie) {
			return [{
				injectTo: 'head-prepend',
				tag: 'meta',
				attrs: {
					'http-equiv': 'X-UA-Compatible',
					content: `IE=${params.ie}`
				}
			}];
		}
	}
};
