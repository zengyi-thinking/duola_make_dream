/**
 * 模型连接测试：对配置档 endpoint 发一次 GET 探针，返回 HTTP 状态与延迟。
 *
 * 计划要求"保存后自动测试连接，返回 200 表示可用"（docs/reaction-plan.md 第三节）。
 * 现有 describeProfileHealth 只做字段非空检查，本模块做真实 ping。
 *
 * 阶段0 用 GET 探针（简单、跨 provider）；阶段4 可升级为发最小 messages 请求做语义级验证。
 * SW 内的 fetch 不受页面 CORS 限制，且 wxt.config 已声明 <all_urls> host 权限。
 */
import type { ModelProfile } from '@/lib/agent/types';
import type { ConnectionTestResult } from './types';

const TIMEOUT_MS = 8000;

export async function testModelConnection(profile: ModelProfile): Promise<ConnectionTestResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(profile.endpoint, {
      method: 'GET',
      // privacy-check: allow — 仅对用户已配置的 endpoint 做 HEAD/GET 探针，apiKey 走 Authorization 头，不外传到日志
      headers: profile.apiKey ? { Authorization: `Bearer ${profile.apiKey}` } : {},
      signal: controller.signal,
    });
    return {
      ok: res.status === 200,
      reachable: true,
      status: res.status,
      latencyMs: Date.now() - start,
      error: res.status === 200 ? undefined : `HTTP ${res.status}`,
    };
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    return {
      ok: false,
      reachable: false,
      status: 0,
      latencyMs: Date.now() - start,
      error: aborted
        ? `连接超时（>${TIMEOUT_MS}ms）`
        : err instanceof Error
          ? err.message
          : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
