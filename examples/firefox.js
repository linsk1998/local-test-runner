const { serve, scan, runQueue, report, judge, QUnit } = require("../dist/index");

serve({
	port: 3000,
	root: __dirname,
	plugins: [QUnit]
}).then(async (httpServer) => {
	try {
		let tasks = await scan("D:/App/Browser/Firefox/*/firefox.exe", {
			filter: (command, version) => parseFloat(version) >= 90,
			map: (command, version) => ({
				preset: 'Firefox',
				command,
				url: "http://localhost:3000/qunit/index.html?firefox=" + version,
				version: version
			}),
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
