// DSH API 探测脚本 - 在插件 apply() 内部执行
// 临时添加到 src/client/index.tsx 开头，构建后在 Console 查看输出

export function apply(ctx) {
  console.log('=== DSH API 探测 (from plugin) ===');
  console.log('ctx keys:', Object.keys(ctx));
  console.log('sidebarRight:', typeof ctx.sidebarRight);
  console.log('sidebarRightTabs:', typeof ctx.sidebarRightTabs);
  console.log('layout:', typeof ctx.layout);
  console.log('slots:', typeof ctx.slots);

  if (ctx.sidebarRight) {
    console.log('sidebarRight methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(ctx.sidebarRight)));
  }

  if (ctx.sidebarRightTabs) {
    console.log('sidebarRightTabs methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(ctx.sidebarRightTabs)));
  }

  if (ctx.slots) {
    console.log('slots keys:', Object.keys(ctx.slots));
    console.log('slots.inject:', typeof ctx.slots.inject);
    console.log('slots.register:', typeof ctx.slots.register);
  }

  // 探测 window 上的 DSH 全局变量
  console.log('window.__ModuleLoader__:', typeof window.__ModuleLoader__);
  console.log('window.dsh:', typeof window.dsh);
  console.log('window.DSH:', typeof window.DSH);
  
  // 列出 window 上所有 dsh/DSH 相关的键
  const dshKeys = Object.keys(window).filter(k => 
    k.toLowerCase().includes('dsh') || 
    k.toLowerCase().includes('harness') ||
    k.toLowerCase().includes('cordis')
  );
  console.log('Window DSH-related keys:', dshKeys);

  console.log('=== 探测完成 ===');
  
  // 正常插件逻辑（暂时不注册任何东西）
}
