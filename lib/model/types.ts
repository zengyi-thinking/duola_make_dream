/**
 * Model 层类型（连接测试等）。
 * 单独抽出避免 messaging/types 反向依赖 service 实现。
 */

export interface ConnectionTestResult {
  /** HTTP 200 —— 计划要求的"可用"判定 */
  ok: boolean;
  /** 网络层可达（fetch resolved，未超时/中断）。404/401/403 也算 reachable */
  reachable: boolean;
  /** HTTP status，0 = 网络层失败 */
  status: number;
  /** 往返耗时 ms */
  latencyMs: number;
  /** 失败/非 200 时的可读说明 */
  error?: string;
}
