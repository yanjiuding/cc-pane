/**
 * 决定"创建新会话"时使用的 resume id。
 *
 * 契约：resume id 只能来自 tab / snapshot / props 链（即 `props.resumeId`）。
 * 严禁在此按目录查询 launch history 兜底——那会把用户"主动新建"劫持成"resume"
 * （回归 bug：右键启动自动恢复上次会话，引入于 commit 65c9a2f）。
 *
 * 这是"新建会话该用哪个 resumeId"的唯一决策点：未来若有人想再次引入历史兜底，
 * 必须改这里，并会被 terminalResume.test.ts 的回归断言拦下。
 */
export function pickCreateSessionResumeId(props: { resumeId?: string }): string | undefined {
  return props.resumeId;
}
