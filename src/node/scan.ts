import * as fs from "fs";
import * as picomatch from "picomatch";
import * as tinyglobby from "tinyglobby";
import type { ScanOptions } from "../../types/ScanOptions";
import type { TaskOptions } from "../../types/TaskOptions";


export async function scan(pattern: string, options: ScanOptions): Promise<TaskOptions[]> {
	let paths = await tinyglobby.glob(pattern, {
		cwd: options.cwd || process.cwd(),
		absolute: true,
		caseSensitiveMatch: true,
	});
	let regex = picomatch.makeRe(pattern, { capture: true, nocase: false });
	let results: RegExpMatchArray[] = paths.map(fake => {
		let result = fake.match(regex);
		let [real, ...args] = result;
		real = fs.realpathSync.native(real);
		return [real, ...args];
	});
	if (options.filter) {
		results = results.filter(function (result, index) {
			return options.filter.apply(null, result);
		});
	}
	let tasks = results.map(function (result, index) {
		return options.map.apply(null, result);
	});
	return tasks;
}
