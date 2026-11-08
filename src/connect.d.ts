import { ParsedUrlQuery } from "querystring";

declare module "http" {
	interface IncomingMessage {
		query: ParsedUrlQuery;
	}
}
