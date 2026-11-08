const { serve, scan, runQueue, report, judge, QUnit } = require("../dist/index");

// 老版本 Opera（Presto 内核，< 13）——Opera preset 会按 version 自动走 Presto flags
serve({
	port: 3000,
	// 老 Opera（Presto 内核）只走 IPv4，localhost 可能解析到 ::1 导致连不上，
	// 所以显式绑定并访问 127.0.0.1
	host: '127.0.0.1',
	root: __dirname,
	plugins: [QUnit]
}).then(async (httpServer) => {
	try {
		let tasks = await scan("D:/App/Browser/Opera/*/opera.exe", {
			filter: (command, version) => parseFloat(version) >= 9 && parseFloat(version) < 13,
			map: (command, version) => ({
				preset: 'Opera',
				command,
				url: "http://127.0.0.1:3000/qunit/index.html?opera=" + version,
				version: version,
				// 默认超时 10s，老 Opera 启动慢，调大到 30s
				timeout: 1000
			}),
		});
		tasks.sort((a, b) => parseFloat(a.version) - parseFloat(b.version));
		console.log("Opera tasks:", tasks.map(t => t.version));
		let results = await runQueue(tasks);
		report(results, tasks);
		if (!judge(results)) {
			process.exitCode = 1;
		}
	} finally {
		httpServer.close();
	}

});
