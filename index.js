/**
 * dsh-workspace-batch 的宿主半边。
 *
 * 本插件不提供宿主侧能力：批量移除全部走浏览器的 `ctx.workspaces` 客户端服务
 * （`WorkspaceRegistry.delete` 经由已有的 remote 通道到宿主），因此这里只需要
 * 占住 Loader 的一行，让 `dsh.client` 声明被 `dsh-client-modules` 扫到。
 */
export function apply() {}
