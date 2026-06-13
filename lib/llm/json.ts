/**
 * 从 LLM 文本响应中提取 JSON 对象。
 *
 * 模型常把 JSON 包在 ```json ... ``` 或附带解释文字中，
 * 此函数尝试多种方式提取首个有效 JSON 对象。
 */
export function extractJson<T = unknown>(text: string): T | null {
  if (!text) return null;

  // 1. 直接尝试整体解析
  try { return JSON.parse(text) as T; } catch { /* 继续 */ }

  // 2. 提取 ```json ... ``` 代码块
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try { return JSON.parse(fenced[1].trim()) as T; } catch { /* 继续 */ }
  }

  // 3. 提取首个 { ... } 块（贪心到末尾）
  const start = text.indexOf('{');
  if (start >= 0) {
    const candidate = text.slice(start);
    try { return JSON.parse(candidate) as T; } catch { /* 继续 */ }
    // 4. 去掉末尾多余字符重试
    const trimmed = candidate.replace(/[,}\]\s]+$/, '');
    try {
      // 补全可能缺失的闭合括号
      return JSON.parse(balanceBraces(trimmed)) as T;
    } catch { /* 继续 */ }
  }

  return null;
}

/** 简单补全未闭合的 { } [ ] */
function balanceBraces(s: string): string {
  let open = 0;
  let inStr = false;
  let esc = false;
  for (const ch of s) {
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{' || ch === '[') open++;
    else if (ch === '}' || ch === ']') open--;
  }
  let result = s;
  for (let i = 0; i < open; i++) {
    result += i % 2 === 0 ? '}' : ']';
  }
  return result;
}
