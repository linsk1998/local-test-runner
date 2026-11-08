import type { NextHandleFunction } from "connect";
import * as escapeHTML from "escape-html";
import * as fs from "fs";
import MagicString from "magic-string";
import * as parse5 from "parse5";
import * as path from "path";
import type { HtmlTagDescriptor, HtmlTransformHook, LoadHtmlHook } from "../../../types/ServeOptions";


const unaryTags = new Set(['link', 'meta', 'base', 'br', 'hr', 'input', 'img']);
function serializeTags(tags: HtmlTagDescriptor[]): string {
	return tags.map((tag) => `${serializeTag(tag)}`).join('');
}
function serializeTag({ tag, attrs, children }: HtmlTagDescriptor): string {
	if (unaryTags.has(tag)) {
		return `<${tag}${serializeAttrs(attrs)}>`;
	} else {
		if (Array.isArray(children)) {
			return `<${tag}${serializeAttrs(attrs)}>${serializeTags(children)}</${tag}>`;
		} else if (children) {
			return `<${tag}${serializeAttrs(attrs)}>${children}</${tag}>`;
		} else {
			return `<${tag}${serializeAttrs(attrs)}></${tag}>`;
		}
	}
}
function serializeAttrs(attrs: HtmlTagDescriptor['attrs']): string {
	let res = '';
	for (const key in attrs) {
		if (typeof attrs[key] === 'boolean') {
			res += attrs[key] ? ` ${key}` : ``;
		} else {
			res += ` ${escapeHTML(key)}="${escapeHTML(attrs[key])}"`;
		}
	}
	return res;
}
function insertHtmlNode(html: string, tags: HtmlTagDescriptor[]): string {
	// 处理入口（html）
	var dom = parse5.parse(html, { sourceCodeLocationInfo: true });
	let magicString = new MagicString(html);
	/** 遍历树处理JS */
	const eachJSNode = (node) => {
		if (node.tagName == "head") {
			tags.forEach((tag) => {
				if (tag.injectTo == "head-prepend" || !tag.injectTo) {
					magicString.appendRight(node.sourceCodeLocation.startTag.endOffset, serializeTag(tag));
				} else if (tag.injectTo == "head") {
					magicString.appendRight(node.sourceCodeLocation.endTag.startOffset, serializeTag(tag));
				}
			});
		} else if (node.tagName == "body") {
			tags.forEach((tag) => {
				if (tag.injectTo == "body-prepend") {
					magicString.appendRight(node.sourceCodeLocation.startTag.endOffset, serializeTag(tag));
				} else if (tag.injectTo == "body") {
					magicString.appendRight(node.sourceCodeLocation.endTag.startOffset, serializeTag(tag));
				}
			});
		}
		if (node.childNodes && node.childNodes.length) {
			for (let child of node.childNodes) {
				eachJSNode.call(node, child);
			}
		}
	};
	eachJSNode(dom);
	return magicString.toString();
}

/**
 * 解析请求 URL，确定对应的 HTML 文件路径：
 * - /page.html       → root/page.html
 * - /subdir/         → root/subdir/index.html
 * - /subdir          → root/subdir/index.html
 * - /                → root/index.html
 * - 其他（.js/.css）  → null（跳过，交给 serve-static）
 */
function resolveHtmlPath(url: string, root: string): string | null {
	const ext = path.extname(url);
	if (ext === '.html') {
		return path.join(root, url);
	}
	if (!ext || url.endsWith('/')) {
		return path.join(root, url, 'index.html');
	}
	return null;
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.promises.access(filePath, fs.constants.R_OK);
		return true;
	} catch {
		return false;
	}
}

/**
 * HTML 中间件：
 * 1. 判断请求是否为 HTML（.html 或目录/index.html）
 * 2. 依次调用 loadHtml 钩子；首个返回非空字符串者直接作为 HTML（跳过磁盘读取）
 * 3. 无钩子命中时回退到读取磁盘文件
 * 4. 如果提供了 transformHtml 自定义转换规则，执行它（支持异步）
 */
export function htmlMiddleware(
	root: string,
	htmlTransformers?: HtmlTransformHook[],
	loadHtmlHooks?: LoadHtmlHook[],
): NextHandleFunction {
	return async function (req, res, next) {
		const url = req.url!;
		const filePath = resolveHtmlPath(url, root);

		// 非 HTML 请求，交给后续中间件处理
		if (!filePath) {
			return next();
		}

		try {
			// Step 1: 调用 loadHtml 钩子，首个命中即采用
			let html: string | undefined;
			if (loadHtmlHooks) {
				for (const hook of loadHtmlHooks) {
					const result = await hook(url);
					if (result != null) {
						html = result;
						break;
					}
				}
			}

			// Step 2: 无钩子命中，回退到磁盘文件
			if (html == null) {
				// 文件不存在，交给 serve-static 返回 404
				if (!(await fileExists(filePath))) {
					return next();
				}
				html = await fs.promises.readFile(filePath, 'utf-8');
			}

			// Step 3: 执行 transformHtml 转换规则（支持异步）
			if (htmlTransformers) {
				let ctx = { filename: url };
				for (let hook of htmlTransformers) {
					let r = await hook(html, ctx);
					if (r) {
						if (typeof r === "string") {
							html = r;
						} else if (Array.isArray(r) || r instanceof Array) {
							html = insertHtmlNode(html, r);
						} else {
							html = insertHtmlNode(r.html, r.tags);
						}
					}
				}
			}

			res.setHeader('Content-Type', 'text/html; charset=utf-8');
			res.end(html);
		} catch (err) {
			console.error('HTML transform error:', err);
			res.statusCode = 500;
			res.end('HTML transform error');
		}
	};
}
