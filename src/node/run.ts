import { exec, execSync, spawn, type ChildProcess } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as pc from "picocolors";
import type { TaskOptions } from "../../types/TaskOptions";
import type { TestResult } from "../../types/TestResult";
import { testEndEmitter, testStartEmitter } from "./task";

// Edge 的固定安装路径（按常见位置探测，找不到时退回 PATH 里的 msedge）
const EDGE_PATH = [
	"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
	"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
].find(function (p) {
	try {
		return fs.statSync(p).isFile();
	} catch {
		return false;
	}
}) || "msedge";

function genPresetOptions(preset: string, version?: string): Partial<TaskOptions> {
	switch (preset) {
		case "Chrome":
			return {
				command: "chrome",
				flags: [
					'--user-data-dir=' + path.resolve(os.tmpdir(), "test-chrome-" + Date.now()),
					// 一次性空缓存目录：no-store 响应头救不了已存在的缓存条目，
					// 空缓存启动才能保证每次拿到的都是服务器上的最新产物
					'--disk-cache-dir=' + path.resolve(os.tmpdir(), "test-chrome-cache-" + Date.now()),
					'--enable-automation',
					'--no-default-browser-check',
					'--no-first-run',
					'--disable-default-apps',
					'--disable-popup-blocking',
					'--disable-translate',
					'--disable-background-timer-throttling',
					'--disable-renderer-backgrounding',
					'--disable-device-discovery-notifications'
				]
			};
		case "Firefox":
			const tempProfileDir = path.resolve(os.tmpdir(), "test-firefox-" + Date.now());
			fs.mkdirSync(tempProfileDir, { recursive: true });
			const userJsContent = `
// ===== 核心防干扰配置 =====
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.bookmarks.restore_default_bookmarks", false);
user_pref("browser.startup.homepage_override.mstone", "ignore");
user_pref("browser.sessionstore.resume_from_crash", false);
user_pref("dom.disable_open_during_load", false);
user_pref("dom.max_script_run_time", 0); // 防止脚本执行慢被强杀
user_pref("dom.max_chrome_script_run_time", 0);

// ===== 直连，不走系统代理（测试服务器在 127.0.0.1） =====
user_pref("network.proxy.type", 0);

// ===== 屏蔽所有更新 =====
user_pref("app.update.enabled", false);
user_pref("app.update.auto", false);
user_pref("app.update.mode", 0);
user_pref("app.update.service.enabled", false);
user_pref("extensions.update.enabled", false);
user_pref("extensions.update.autoUpdateDefault", false);
user_pref("extensions.getAddons.showPane", false);
user_pref("extensions.checkCompatibility", false);

// ===== 屏蔽遥测与安全拦截 =====
user_pref("datareporting.healthreport.service.enabled", false);
user_pref("datareporting.healthreport.uploadEnabled", false);
user_pref("datareporting.policy.dataSubmissionEnabled", false);
user_pref("toolkit.telemetry.enabled", false);
user_pref("browser.safebrowsing.enabled", false);
user_pref("browser.safebrowsing.malware.enabled", false);
`;
			// 写入 user.js
			fs.writeFileSync(path.join(tempProfileDir, 'user.js'), userJsContent);
			return {
				command: "firefox",
				flags: [
					// -profile 与路径必须拆成两个参数，合在一起会被当成单个 argv
					'-no-remote',
					'-profile',
					tempProfileDir
				]
			};
		case "Edge":
			return {
				command: EDGE_PATH,
				flags: [
					'--user-data-dir=' + path.resolve(os.tmpdir(), "test-edge-" + Date.now()),
				]
			};
		case "EdgeIEMode":
			return {
				command: EDGE_PATH,
				flags: [
					'--user-data-dir=' + path.resolve(os.tmpdir(), "test-ie-" + Date.now()),
					'--ie-mode-test'
				]
			};
		case "Opera": {
			const v = parseFloat(version || '99');
			if (v < 12.6) {
				return {
					command: "opera"
				};
			}
			if (v < 13) {
				// Opera Classic（12.60 < Presto，< v13）需要在 -pd 指定的 profile 目录下写 operaprefs.ini，
				// 否则首次启动会弹出初始化许可对话框阻塞在前台，导致加载超时。

				/**
				 * Opera Classic（Presto 内核，v12 及以下）的 operaprefs.ini。
				 * 作用：关闭所有初始化弹窗、设置启动类型为空白页、接受许可协议，
				 * 让浏览器在自动启动时不阻塞在首次启动对话框上。
				 * 内容来源：karma-opera-launcher 的 config/prefs.ini。
				 */
				const OPERA_CLASSIC_PREFS = [
					'Opera Preferences version 2.1',
					'',
					'[User Prefs]',
					'Show Default Browser Dialog = 0',
					'Startup Type = 4',
					'Home URL = about:blank',
					'Show Close All But Active Dialog = 0',
					'Show Close All Dialog = 0',
					'Show Crash Log Upload Dialog = 0',
					'Show Delete Mail Dialog = 0',
					'Show Download Manager Selection Dialog = 0',
					'Show Geolocation License Dialog = 0',
					'Show Mail Error Dialog = 0',
					'Show New Opera Dialog = 0',
					'Show Problem Dialog = 0',
					'Show Progress Dialog = 0',
					'Show Validation Dialog = 0',
					'Show Widget Debug Info Dialog = 0',
					'Show Startup Dialog = 0',
					'Show E-mail Client = 0',
					'Show Mail Header Toolbar = 0',
					'Show Setupdialog On Start = 0',
					'Ask For Usage Stats Percentage = 0',
					'Enable Usage Statistics = 0',
					'Disable Opera Package AutoUpdate = 1',
					'Browser JavaScript = 0',
					'',
					'[Install]',
					'Newest Used Version = 1.00.0000',
					'',
					'[State]',
					'Accept License = 1',
					'Run = 0',
				].join('\n');
				// Opera Classic（Presto 内核，≤ v12）：用 -pd 指定 profile 目录，-nomail 禁邮件客户端。
				// 与 Chromium 风格的 --user-data-dir 完全不同。
				const profileDir = path.resolve(os.tmpdir(), "test-opera-" + Date.now());
				fs.mkdirSync(profileDir, { recursive: true });
				fs.writeFileSync(path.join(profileDir, 'operaprefs.ini'), OPERA_CLASSIC_PREFS, 'utf8');
				return {
					command: "opera",
					flags: [
						'-pd', profileDir,
						'-nomail'
					]
				} as any;
			}
			// Opera（Chromium 内核，≥ v15）
			return {
				command: "opera",
				flags: [
					'--user-data-dir=' + path.resolve(os.tmpdir(), "test-opera-" + Date.now()),
					'--no-default-browser-check',
					'--no-first-run',
					'--disable-default-apps'
				]
			};
		}
		default:
			return {};
	}
}

function killBrowser(child: ChildProcess, command: string) {
	try {
		if (process.platform === 'win32') {
			try {
				execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
			} catch (e) {
				if (command.includes('\\')) {
					const psCommand = `Get-Process firefox | Where-Object { $_.Path -eq '${command}' } | Stop-Process -Force`;
					console.log(`powershell -Command "${psCommand}"`);
					execSync(`powershell -Command "${psCommand}"`, { stdio: 'ignore' });
					console.log(`已成功杀掉路径为 ${command} 的 Firefox`);
				} else {
					execSync(`taskkill /im ${command} /T /F`, { stdio: 'ignore' });
				}
			}
		} else {
			child.kill('SIGKILL');
		}
	} catch (e) {
		// taskkill 找不到进程 = 进程已经自己死了 = 不需要清理
		// 这不是错误，这是好事！静默忽略即可。
		console.log('进程已自行退出，无需清理');
	}
}

/**
 * 激活浏览器窗口：并行跑多个浏览器时，部分浏览器弹出后在后台不加载页面，
 * 手动激活才会开始加载（Windows 前台锁机制），导致启动超时。
 * 启动后延时激活一次窗口可避免。
 */
function activateWindow(child: ChildProcess) {
	if (process.platform !== 'win32' || !child.pid) return;
	setTimeout(() => {
		try {
			exec(
				`powershell -NoProfile -Command "(New-Object -ComObject WScript.Shell).AppActivate(${child.pid})"`,
				{ stdio: 'ignore', windowsHide: true } as any
			);
		} catch (e) { /* 激活失败不影响测试，超时兜底 */ }
	}, 2000);
}

/**
 * 清除老版本 Opera（< 12.6）上次的会话记录与"未正常退出"状态。
 *
 * 这些版本不支持 -pd（参数会被当成 URL 打开成标签页），没法用临时 profile 隔离；
 * 浏览器被强杀后 profile 里会留下两处痕迹，导致下次启动弹窗询问是否从上次会话继续：
 *   1. sessions/autosave.win（崩溃恢复会话）—— 改名备份即可
 *   2. operaprefs.ini 里的 [State] Run=1（标记上次未正常退出）—— 重置为 0
 * 启动前清理这两处，下次启动就不会再询问，也不会恢复上次的标签页。
 */
function clearOperaSessionRecords(version?: string, command?: string) {
	const appData = process.env.APPDATA;
	const roots: string[] = [];
	if (appData && version) {
		roots.push(
			path.join(appData, 'Opera', version),            // 10.x–12.x
			path.join(appData, 'Opera', version, 'profile')  // 9.x
		);
	}
	// Multi User=0 的安装（如 12.17）把 profile 放在安装目录下，不受 -pd 控制
	if (command && path.isAbsolute(command)) {
		const installDir = path.dirname(command);
		roots.push(
			path.join(installDir, 'profile'),
			installDir
		);
	}
	for (const root of roots) {
		const sessions = path.join(root, 'sessions');
		for (const name of ['autosave.win', 'autosave.win.bak']) {
			const file = path.join(sessions, name);
			try {
				fs.unlinkSync(file + '.cleared');
			} catch {
				// 上一次的备份不存在，忽略
			}
			try {
				fs.renameSync(file, file + '.cleared');
			} catch {
				// 文件不存在（从未异常退出）或被占用时忽略
			}
		}
		// 9.x 的配置文件叫 opera6.ini，10.x–12.x 才叫 operaprefs.ini
		for (const name of ['operaprefs.ini', 'opera6.ini']) {
			const prefs = path.join(root, name);
			try {
				const text = fs.readFileSync(prefs, 'utf8');
				const fixed = text.replace(/^Run=1\r?$/m, 'Run=0');
				if (fixed !== text) fs.writeFileSync(prefs, fixed, 'utf8');
			} catch {
				// prefs 读取失败时不影响启动
			}
		}
	}
}

export function run(options: TaskOptions): Promise<TestResult> {
	var url: string, command: string, child: ChildProcess;
	var timeout: number;
	return new Promise<void>(function (resolve, reject) {
		let resolvedOptions: Partial<TaskOptions> = {};
		if (options.preset) {
			let presetOptions = genPresetOptions(options.preset, options.version);
			resolvedOptions = {
				...presetOptions,
				...options,
			};
			if (options.flags && presetOptions.flags) {
				resolvedOptions.flags = [...presetOptions.flags, ...options.flags];
			}
		} else {
			resolvedOptions = options;
		}
		let { flags } = resolvedOptions;
		url = resolvedOptions.url;
		command = resolvedOptions.command;
		timeout = resolvedOptions.timeout || 10000;
		// Opera（含 -pd 被忽略的单用户安装，如 12.17）启动前清理上次未正常退出留下的
		// 会话与 Run=1 状态，否则会弹出"继续上次会话"/欢迎对话框，阻塞页面加载
		if (options.preset === 'Opera') {
			clearOperaSessionRecords(options.version, command);
		}
		// 老版本 Opera 会把 URL 之后的参数当成额外 URL 各开一个标签页，
		// 所以 flags 必须放在 URL 前面（例如 `opera -pd <dir> -nomail <url>`）
		let args: string[] = [];
		if (flags) args.push(...flags);
		args.push(url);
		child = spawn(command, args);
		// 后台窗口可能不加载页面，延时激活一次
		activateWindow(child);
		let startTimer = setTimeout(() => {
			// 超时的浏览器也要杀掉，否则残留进程会一直占住父进程的事件循环
			killBrowser(child, command!);
			reject(new Error("Browser run timed out on: " + command));
		}, timeout);
		testStartEmitter.once(url, function () {
			clearTimeout(startTimer);
			resolve();
		});
	}).then(function () {
		return new Promise(function (resolve, reject) {
			let runTimer = setTimeout(() => {
				killBrowser(child, command!);
				reject(new Error("Test run timed out on: " + url));
			}, timeout);
			testEndEmitter.once(url, function (data) {
				clearTimeout(runTimer);
				var result = toTestResult(data);
				resolve(result);
				logTestResult(options, result);
				killBrowser(child, command!);
			});
		});
	});
}
function toTestResult(data: any): TestResult {
	// 表单 POST 上来的都是字符串，统一转成数字，
	// 防止上层 report 求和/比较时变成字符串拼接
	var result: TestResult = {
		passed: Number(data.passed) || 0,
		total: Number(data.total) || 0,
		runtime: Number(data.runtime) || 0
	};
	if (data.failures != null) {
		result.failures = Number(data.failures) || 0;
		var details: string[] = [];
		for (var i = 0; i < result.failures && i < 50; i++) {
			var detail = data["fail" + i];
			if (detail != null) details.push(String(detail));
		}
		if (details.length) result.failureDetails = details;
	}
	return result;
}
function logTestResult(options: TaskOptions, result: TestResult) {
	const browser = options.browser || options.preset || 'Unknown';
	const version = options.version || '';

	const failed = result.total - result.passed;
	const isSuccess = failed === 0;

	const timeStr = `${result.runtime}ms`;

	if (isSuccess) {
		// 🟢 全部通过：绿色高亮，粗体强调通过数
		console.log(
			pc.green('✓') + ' ' +
			pc.green(pc.bold(`${browser} v${version}:`)) + ' ' +
			pc.green(`${result.passed}/${result.total} passed`) + ' ' +
			pc.dim(`(${timeStr})`)
		);
	} else {
		// 🔴 存在失败：红色高亮，粗体强调失败数
		console.log(
			pc.red('✗') + ' ' +
			pc.red(pc.bold(`${browser} v${version}:`)) + ' ' +
			pc.red(`${result.passed}/${result.total} failed`) + ' ' +
			pc.dim(`(${timeStr})`)
		);
	}
}
