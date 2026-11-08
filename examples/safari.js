const { serve, scan, runQueue, report, judge, QUnit } = require("../dist/index");

// 用 Playwright 下载的 WebKit（MiniBrowser）模拟 Safari
serve({
	port: 3000,
	root: __dirname,
	plugins: [QUnit]
}).then(async (httpServer) => {
	try {
		let tasks = await scan("D:/App/Browser/Safari/*/Playwright.exe", {
			filter: (command, folder) => parseFloat(safariVersion(folder)) > 0,
			map: (command, folder) => {
				let version = safariVersion(folder);
				return {
					// 无对应 preset，直接用命令行拉起：Playwright MiniBrowser 接受 URL 作为参数
					command,
					url: "http://localhost:3000/qunit/index.html?webkit=" + version,
					browser: 'Safari(WebKit)',
					version: version
				};
			},
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

function safariVersion(folder) {
	// 文件夹名形如 "Playwright(26.5)"，提取括号内的版本号
	let m = folder.match(/\((.+)\)/);
	return m ? m[1] : folder;
}
