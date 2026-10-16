/** JSON-only boundary: credentials are deliberately absent from this API. */
export interface TransportRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}
export interface TransportResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}
export type Transport = (
  request: TransportRequest,
  signal: AbortSignal,
) => Promise<TransportResponse>;
export type ExecutionEvent = { runId: string } & (
  | { type: "start" }
  | { type: "stdout" | "stderr"; text: string }
  | { type: "result"; operation: string; data: unknown }
  | { type: "exit"; code: number; files: Record<string, string> }
  | { type: "cancelled" }
  | { type: "error"; message: string }
);
export interface ExecutionResult {
  code: number;
  stdout: string;
  stderr: string;
  files: Record<string, string>;
}
