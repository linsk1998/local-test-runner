const { serve, run, QUnit, EmulateIE } = require("../dist/index");

serve({
	port: 3000,
	root: __dirname,
	plugins: [QUnit, EmulateIE]
}).then(async (httpServer) => {
	try {
		let result = await run({
			preset: 'EdgeIEMode',
			url: "http://localhost:3000/qunit/index.html?ie=11",
			browser: 'IE',
			version: '11'
		});
		console.log(result);
	} finally {
		httpServer.close();
	}

});
