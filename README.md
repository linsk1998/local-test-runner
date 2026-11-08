# local-test-runner

[![npm version](https://img.shields.io/npm/v/local-test-runner.svg)](https://www.npmjs.com/package/local-test-runner)
[![license](https://img.shields.io/npm/l/local-test-runner.svg)](https://github.com/linsk1998/local-test-runner)
[![GitHub](https://img.shields.io/badge/github-linsk1998%2Flocal--test--runner-blue.svg)](https://github.com/linsk1998/local-test-runner)

在本机已安装的真实浏览器中运行前端测试用例。用电脑里已有的 Chrome、Firefox、Safari(WebKit)、Opera、Edge、IE 模式直接跑测试，提前发现兼容性问题，减少流水线上的测试负担。

项目地址：[https://github.com/linsk1998/local-test-runner](https://github.com/linsk1998/local-test-runner)

## 特性

- **真实浏览器**：直接启动本机安装的浏览器，可同时覆盖多个版本（Chrome 90+、Firefox 90+、老版本 Opera 等）。
- **测试框架无关**：内置 QUnit、Mocha 插件，自动注入结果上报脚本；也可以按协议接入任意框架。
- **自动扫描**：`scan()` 按 glob 扫描安装目录，从路径中提取版本号并生成任务队列。
- **串行/并行**：`runQueue()` 同浏览器串行，`Promise.allSettled()` 不同浏览器并行。
- **AI 友好**：`report()` 输出汇总与失败明细，`judge()` 返回是否通过，配合 `process.exitCode` 即可。
- **不污染本机数据**：Chrome/Firefox/Edge/Opera 使用临时 profile，Chrome 额外使用空缓存目录。

## 环境要求

- Node.js >= 16
- Windows：进程清理（taskkill）、窗口激活、Opera 会话清理等能力目前基于 Windows 实现；其他平台仅保证基础启动与结束。

## 安装

```bash
npm install -D local-test-runner
# 或
pnpm add -D local-test-runner
```

## 快速开始

```js
const { serve, scan, runQueue, report, judge, QUnit } = require("local-test-runner");

serve({
	port: 3000,
	host: "127.0.0.1",
	root: __dirname,
	plugins: [QUnit]
}).then(async (httpServer) => {
	try {
		let tasks = await scan("D:/App/Browser/Chrome/*/chrome.exe", {
			filter: (command, version) => parseFloat(version) >= 90,
			map: (command, version) => ({
				preset: "Chrome",
				command,
				url: "http://127.0.0.1:3000/qunit/index.html?chrome=" + version,
				version: version
			})
		});
		tasks.sort((a, b) => parseFloat(a.version) - parseFloat(b.version));

		let results = await runQueue(tasks);
		report(results, tasks);
		if (!judge(results)) {
			process.exitCode = 1;
		}
	} finally {
		httpServer.close();
	}
});
```

测试页任意写一个 QUnit 页面即可（参考 `examples/qunit/index.html`），无需关心结果如何回传。

## 工作流程

1. `serve()` 启动本地静态服务器，并把插件注入的脚本插入返回的 HTML。
2. `run()` 用命令行启动浏览器，并等待浏览器发起页面请求（`GET`）。
3. 测试页面跑完后，注入脚本把结果以表单 `POST /` 提交回服务器。
4. 服务器按 `Referer` 匹配对应任务，解析结果、关闭窗口并清理浏览器进程。
5. `runQueue()` / 手工并行调度多个任务，最后由 `report()`、`judge()` 汇总。

## API

### serve(options): Promise<http.Server>

启动本地测试服务器，返回 Node `http.Server`，用 `server.close()` 关闭。

| 选项               | 类型                                     | 默认值          | 说明                                                                          |
| ------------------ | ---------------------------------------- | --------------- | ----------------------------------------------------------------------------- |
| `root`             | `string`                                 | `process.cwd()` | 静态资源根目录                                                                |
| `host`             | `string`                                 | `"localhost"`   | 监听地址。老浏览器建议用 `"127.0.0.1"`，避免 `localhost` 解析到 IPv6 的 `::1` |
| `port`             | `number`                                 | `80`            | 监听端口                                                                      |
| `contextPath`      | `string`                                 | `"/"`           | 二级目录前缀                                                                  |
| `proxy`            | `Record<string, string \| ProxyOptions>` | -               | http-proxy 代理规则                                                           |
| `headers`          | `OutgoingHttpHeaders`                    | -               | 追加/覆盖响应头；默认返回 `Cache-Control: no-store` 等禁缓存头                |
| `plugins`          | `Plugin[]`                               | -               | 插件数组，见下文                                                              |
| `htmlTransformers` | `HtmlTransformHook[]`                    | -               | 已弃用，等价于各插件的 `transformHtml`                                        |
| `https` / `cors`   | -                                        | -               | 预留选项，当前版本未实现                                                      |

内置中间件顺序：响应头 → 代理 → query 解析 → 结果回调 → HTML 处理 → 静态文件。

### run(task): Promise<TestResult>

启动一个浏览器任务并等待测试结果。浏览器启动或测试超时（默认 10 秒）会 reject。

| 选项      | 类型       | 说明                                         |
| --------- | ---------- | -------------------------------------------- |
| `url`     | `string`   | **必填**，测试页地址                         |
| `preset`  | `string`   | 浏览器预设，自动生成命令与启动参数           |
| `command` | `string`   | 浏览器可执行文件路径；`preset` 未提供时必填  |
| `flags`   | `string[]` | 追加启动参数（与 preset 参数合并）           |
| `browser` | `string`   | 报告中显示的名称，默认取 `preset`            |
| `version` | `string`   | 报告中显示的版本号，同时影响部分 preset 分支 |
| `timeout` | `number`   | 启动超时与测试执行超时，默认 `10000` 毫秒    |

`TestResult` 结构：

```ts
interface TestResult {
	passed: number;
	total: number;
	runtime: number;          // 毫秒
	failures?: number;        // 失败断言总数
	failureDetails?: string[]; // 失败明细，最多 50 条
}
```

预设（`preset`）：

| 值                 | 行为                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'Chrome'`         | 临时 `--user-data-dir` + 空 `--disk-cache-dir`，关闭首次运行/翻译/后台节流等干扰                                                                              |
| `'Firefox'`        | 生成临时 profile 与 `user.js`，关闭更新、遥测、会话恢复、系统代理等                                                                                           |
| `'Edge'`           | 临时 `--user-data-dir`，自动探测 msedge 安装路径                                                                                                              |
| `'EdgeIEMode'`     | 在 Edge 上追加 `--ie-mode-test`，配合 `EmulateIE` 插件与 `?ie=11` 使用                                                                                        |
| `'Opera'`          | 按 `version` 分档：<12.6 无额外参数；12.6–13 写入 `operaprefs.ini` 并使用 `-pd`；>=13 使用 Chromium 参数。启动前会清理上次未正常退出留下的会话与 `Run=1` 状态 |
| `'Safari'`、`'IE'` | 无内置启动参数，请用 `command` 自行指定（Safari 可用 Playwright WebKit，见 `examples/safari.js`）                                                             |

### runQueue(tasks): Promise<PromiseSettledResult<TestResult>[]>

顺序运行任务，任务之间间隔 200 毫秒。**单个任务失败不会中断队列**，结果与 `Promise.allSettled()` 格式一致：

```ts
[
	{ status: "fulfilled", value: TestResult },
	{ status: "rejected", reason: Error }
]
```

### scan(pattern, options): Promise<TaskOptions[]>

按 glob 扫描浏览器安装目录并生成任务。`filter` 与 `map` 会收到 glob 的捕获组参数：第一个参数是文件真实路径，后面是 `*` 捕获到的内容。

```js
await scan("D:/App/Browser/Chrome/*/chrome.exe", {
	// (command, version)
	filter: (command, version) => parseFloat(version) >= 90,
	map: (command, version) => ({
		preset: "Chrome",
		command,
		url: "http://127.0.0.1:3000/qunit/index.html?chrome=" + version,
		version
	})
});
```

| 选项     | 说明                                     |
| -------- | ---------------------------------------- |
| `cwd`    | 扫描基准目录，默认 `process.cwd()`       |
| `filter` | 过滤函数，返回 `false` 的任务会被丢弃    |
| `map`    | **必填**，把扫描结果映射为 `TaskOptions` |

### report(results, tasks?): ReportSummary

逐行输出每个任务的通过情况与失败明细，末尾输出总计。`results` 支持 `MultiTestResult`（单个结果、`runQueue` 结果、并行 `allSettled` 结果及其任意嵌套数组），内部会先扁平化。`tasks` 与扁平化后的结果按下标对应，用于显示浏览器名称/版本；缺省显示 `Task#N`。

返回统计对象：

```ts
interface ReportSummary {
	tasks: number;
	tasksPassed: number;
	tasksFailed: number; // 含用例失败与任务级错误
	tasksErrored: number;
	passed: number;
	failed: number;
	tests: number;
	runtime: number;
}
```

### judge(results): boolean

没有任何任务被拒绝、且每个已完成任务至少跑了 1 条用例并全部通过时返回 `true`；空数组也视为通过。支持与 `report` 相同的嵌套结果结构。

### MultiTestResult

```ts
type MultiTestResult =
	| TestResult
	| TestResult[]
	| QueueTestResult
	| QueueTestResult[]
	| ParallelTestResult
	| ParallelTestResult[];
```

`report()` 与 `judge()` 都接受该类型，可把多次 `runQueue()`、`Promise.allSettled()` 的结果直接传进去。

## 插件

```ts
interface Plugin {
	/** 按访问路径返回 HTML；返回非空字符串时跳过磁盘读取。支持异步 */
	loadHtml?: (url: string) => string | null | undefined | Promise<string | null | undefined>;

	/** 修改返回的 HTML：返回完整字符串，或要注入的标签数组。支持异步 */
	transformHtml?: (
		html: string,
		ctx: { filename: string }
	) => string | HtmlTagDescriptor[] | { html: string; tags: HtmlTagDescriptor[] } | void | Promise<...>;

	/** 在内置中间件 use 之前执行；可往 ctx.middlewares（connect app）注册中间件。
	 *  返回函数时，该函数会在内置中间件 use 之后执行。支持异步 */
	configureServer?: (ctx: { middlewares: ConnectServer }) =>
		void | ((ctx: { middlewares: ConnectServer }) => void | Promise<void>)
		| Promise<void | ((ctx) => void | Promise<void>)>;
}

interface HtmlTagDescriptor {
	tag: string;
	attrs?: Record<string, string>;
	children?: string | HtmlTagDescriptor[];
	/** 默认 'head-prepend' */
	injectTo?: "head" | "body" | "head-prepend" | "body-prepend";
}
```

内置插件：

- **`QUnit`**：注入 QUnit 结果上报脚本，兼容 QUnit 1.x 与 2.x。
- **`Mocha`**：劫持 `Mocha.Runner.prototype.run`，收集 `fail`/`end` 事件，兼容 Mocha 1.16 浏览器版。测试页需在 `window.onload` 中调用 `mocha.run()`，确保注入脚本先执行。
- **`EmulateIE`**：根据 URL 上的 `?ie=N` 注入 `<meta http-equiv="X-UA-Compatible" content="IE=N">`，配合 `EdgeIEMode` 预设。

### 结果上报协议

如果使用内置插件之外的自定义框架，可在页面里按同样格式回传：

```
POST /
Content-Type: application/x-www-form-urlencoded
Referer: 任务的完整 URL

total=3&passed=2&runtime=120&failures=1&fail0=用例名 :: 失败信息
```

`Referer` 必须与任务 `url` 完全一致；服务器收到后返回一个自动 `window.close()` 的页面。

## 示例

| 文件                        | 说明                                           |
| --------------------------- | ---------------------------------------------- |
| `examples/chrome.js`        | 扫描并串行运行所有 Chrome（>=90）              |
| `examples/firefox.js`       | 扫描并串行运行所有 Firefox（>=90）             |
| `examples/safari.js`        | 用 Playwright WebKit 模拟 Safari               |
| `examples/ie.js`            | Edge IE 模式 + `EmulateIE` 插件                |
| `examples/opera.js`         | 老版本 Opera（Presto，9–12）                   |
| `examples/parallel.js`      | 不同浏览器并行、同浏览器串行                   |
| `examples/mocha.js`         | Mocha 1.16 示例（`examples/mocha/index.html`） |
| `examples/qunit/index.html` | QUnit 1.9 测试页                               |

完整示例源码见 [GitHub 仓库](https://github.com/linsk1998/local-test-runner)。示例依赖 `dist` 产物，先构建再运行：

```bash
pnpm build
node examples/chrome.js
```

## 注意事项

- **老浏览器与 IPv6**：`localhost` 可能解析到 `::1`，老 Opera 等只走 IPv4，请把 `host` 与访问地址都改成 `127.0.0.1`。
- **缓存**：服务器默认返回禁用缓存头，但浏览器已有的缓存条目不受影响；Chrome 预设使用空缓存目录，页面静态资源建议再加 `?v=版本号` 兜底。
- **老 Presto Opera 不执行服务器注入的脚本**，需要在页面内做结果上报兜底（见 `examples/qunit/index.html`）。
- **超时**：启动与执行共用 `timeout`，默认 10 秒；老浏览器或测试较多的页面请调大。
- **自定义测试页**：HTML 中间件也会处理目录请求（`/dir/`、`/dir` → `index.html`），JS/CSS 交给静态文件中间件。

## 问题反馈

- 提交 Issue：[linsk1998/local-test-runner/issues](https://github.com/linsk1998/local-test-runner/issues)
- 仓库地址：[https://github.com/linsk1998/local-test-runner](https://github.com/linsk1998/local-test-runner)

## License

[MIT](LICENSE)
