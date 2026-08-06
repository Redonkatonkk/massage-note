export default function OfflinePage() {
  return <main className="center-page"><section className="setup-card"><p className="eyebrow">当前离线</p><h1>暂时无法连接店铺数据</h1><p className="field-help">为了避免多台设备互相覆盖，离线时不允许新增、修改、删除、日结或结算。请检查网络后重新打开；尚未提交的页面请不要关闭。</p><a className="primary-action offline-refresh" href="/">联网后刷新页面</a></section></main>;
}
