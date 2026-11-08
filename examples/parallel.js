const { serve, scan, runQueue, report, judge, QUnit } = require("../dist/index");

serve({
	port: 3000,
	root: __dirname,
	plugins: [QUnit]
}).then(async (httpServer) => {
	try {
		// 各浏览器扫描各自的版本队列
		let [chromeTasks, firefoxTasks, safariTasks] = await Promise.all([
			scan("D:/App/Browser/Chrome/*/chrome.exe", {
				filter: (command, version) => parseFloat(version) >= 90,
				map: (command, version) => ({
					preset: 'Chrome',
					command,
					url: "http://localhost:3000/qunit/index.html?chrome=" + version,
					version: version
				}),
			}),
			scan("D:/App/Browser/Firefox/*/firefox.exe", {
				filter: (command, version) => parseFloat(version) >= 90,
				map: (command, version) => ({
					preset: 'Firefox',
					command,
					url: "http://localhost:3000/qunit/index.html?firefox=" + version,
					version: version
				}),
			}),
			scan("D:/App/Browser/Safari/*/Playwright.exe", {
				filter: (command, folder) => parseFloat(safariVersion(folder)) > 0,
				map: (command, folder) => {
					let version = safariVersion(folder);
					return {
						command,
						url: "http://localhost:3000/qunit/index.html?webkit=" + version,
						browser: 'Safari(WebKit)',
						version: version
					};
				},
			}),
		]);

		chromeTasks.sort((a, b) => parseFloat(a.version) - parseFloat(b.version));
		firefoxTasks.sort((a, b) => parseFloat(a.version) - parseFloat(b.version));
		safariTasks.sort((a, b) => parseFloat(a.version) - parseFloat(b.version));

		// 同浏览器串行（runQueue），不同浏览器并行（Promise.allSettled）
		let results = await Promise.allSettled([
			runQueue(chromeTasks),
			runQueue(firefoxTasks),
			runQueue(safariTasks),
		]);

		// report / judge 内部会扁平化：数组、以及 fulfilled.value 为数组的外层包裹都会被解开
		let allTasks = chromeTasks.concat(firefoxTasks, safariTasks);
		report(results, allTasks);
		if (!judge(results)) {
			process.exitCode = 1;
		}
	} finally {
		httpServer.close();
	}

});

function safariVersion(folder) {
	let m = folder.match(/\((.+)\)/);
	return m ? m[1] : folder;
}
