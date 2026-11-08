import type { TaskOptions } from "./TaskOptions";

export interface ScanOptions {
	cwd?: string;
	filter?: (...args: string[]) => boolean;
	map: (...args: string[]) => TaskOptions;
}
