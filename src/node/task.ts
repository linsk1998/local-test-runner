import { EventEmitter } from "events";

export const testStartEmitter = new EventEmitter();
export const testEndEmitter = new EventEmitter();

export enum TaskStatus {
	Waiting,
	Running,
	Finished,
}

export class Task {
	status: TaskStatus;

}

