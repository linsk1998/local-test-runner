const path = require("path");
const fs = require("fs-extra");
const typescript = require("@rollup/plugin-typescript");
const builtinModules = require("builtin-modules").default;
const pkg = require("./package.json");


module.exports = async function () {
	await fs.emptyDir(path.resolve(__dirname, "./dist"));
	return [{
		input: "src/node/index.ts",
		context: "global",
		output: {
			dir: "dist",
			format: "commonjs",
			interop: "esModule",
			hoistTransitiveImports: false,
			chunkFileNames: "assets/[hash].js"
		},
		external: [
			...Object.keys(pkg.dependencies),
			...builtinModules
		],
		plugins: [
			typescript(),
		],
		watch: {
			exclude: ["node_modules/**/*"]
		}
	}];
};
