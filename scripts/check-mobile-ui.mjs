import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { uiStyleFiles } from "./check-ui-styles.mjs";

const root = resolve(import.meta.dirname, "..");
const webRequire = createRequire(resolve(root, "apps/web/package.json"));
const { JSDOM } = webRequire("jsdom");
const postcss = webRequire(webRequire.resolve("postcss", { paths: [dirname(webRequire.resolve("next/package.json"))] }));
export const mobileWidths = [320, 360, 390, 414, 480, 600, 760];

const panel = (selector) => [selector, { "border-radius": "10px", "background-color": "rgb(255, 255, 255)" }];
const field = (selector) => [selector, { height: "44px", "border-radius": "6px", "font-size": "16px" }];
const touch = (selector) => [selector, { "min-height": { min: 44 } }];
const single = (selector) => [selector, { "grid-template-columns": ["1fr", "minmax(0, 1fr)"] }];
const table = '<div class="table-scroll"><table class="data-table"><tbody><tr><td>Long employee name · $1,234.56</td></tr></tbody></table></div>';
const responsiveRecords = `<div class="responsive-data-view"><div class="desktop-data-view">${table}</div><div class="mobile-data-view"><ul class="mobile-data-list"><li><article class="mobile-data-card"><header><div><h3>Long employee name / 员工</h3></div></header><dl class="record-facts"><div><dt>删除原因 / Reason</dt><dd>需要核对的完整删除原因 / A complete reason that must wrap</dd></div></dl><footer class="mobile-data-card__actions"><button class="table-action">恢复</button></footer></article></li></ul></div></div>`;
const tabs = '<nav class="section-tabs"><button class="active">财务汇总 / Financial summary</button><button>工资结算 / Payroll settlement</button></nav>';
const form = '<div class="manage-form-grid"><label>姓名 / Name<input value="Long employee name"></label><label>语言 / Language<select><option>使用店铺默认 / Store default</option></select></label></div>';
const filter = '<form class="filter-panel"><div class="filter-panel__heading"><div><strong>筛选 / Filters</strong></div><a class="export-link primary-action">导出 / Export</a></div><label>日期<input type="date"></label><button class="primary-action">查询 / Search</button></form>';
const summary = '<div class="summary-strip board-extra-metrics">' + Array.from({ length: 4 }, () => '<div class="overview-metric"><strong>$1,234.56</strong></div>').join("") + '</div>';
const projectStates = [[true, true], [true, false], [false, true], [false, false]].map(([giftEmpty, lostEmpty]) => `<div class="board-store-projects"><section class="board-panel gift-card-sales${giftEmpty ? " gift-card-sales--empty" : ""}"></section><section class="board-panel lost-customers" data-empty="${lostEmpty}"></section></div>`).join("");

// Small DOM fixtures use the real component classes, not a browser or a layout renderer.
// They verify resolved styles and reflow rules; they cannot prove pixel layout or overflow.
export const mobileScreens = [
  ["记工", "/", `<main class="app-shell"><section class="board-overview">${summary}</section><section class="board-panel board-empty-state"></section><div class="board-panel add-employee-panel"><select><option>选择员工</option></select></div><div class="board-store-projects"><section class="board-panel gift-card-sales gift-card-sales--empty"></section><section class="board-panel lost-customers" data-empty="false"></section></div><button class="record-card record-card--highlighted" disabled>高亮</button></main>`, [panel(".board-empty-state"), panel(".add-employee-panel"), panel(".gift-card-sales"), panel(".lost-customers"), single(".board-store-projects"), [".board-extra-metrics > :nth-child(3)", { "border-left-width": "0px", "border-top-width": "1px" }], [".record-card--highlighted", { "background-color": "rgb(237, 242, 233)" }]]],
  ["财务汇总", "/finance", `<main class="app-shell finance-shell">${tabs}${filter}<div class="finance-cards"><article class="finance-summary-card"></article></div>${table}<article class="employee-subtotal-card"><header><button>12 单</button></header></article><section class="employee-subtotal-send-panel"><input type="tel"><button class="primary-action">发送</button></section></main>`, [panel(".filter-panel"), panel(".finance-summary-card"), field("input[type=date]"), touch(".export-link"), touch(".employee-subtotal-send-panel button"), touch(".employee-subtotal-card header button"), [".section-tabs button", { "border-radius": "0px", "background-color": "rgba(0, 0, 0, 0)" }], [".table-scroll", { "overflow-x": "auto" }]]],
  ["经营分析", "/finance", `<main class="app-shell finance-shell"><section class="analytics-panel">${filter}<div class="analytics-grid"><article class="analytics-card"><div class="analytics-scroll"><svg width="950"></svg><table class="analytics-heat-table"><tbody><tr><th>星期一</th><td><button>3</button></td></tr></tbody></table></div></article></div></section></main>`, [panel(".analytics-card"), single(".analytics-grid"), touch(".analytics-heat-table button"), [".analytics-heat-table button", { "font-size": "14px", "min-width": "44px" }], [".filter-panel", { "display": "flex", "flex-direction": "column" }], [".analytics-scroll", { "overflow-x": "auto" }]]],
  ["支出", "/finance", '<main class="app-shell finance-shell"><section class="expenses-panel"><div class="expenses-filter"><div class="expenses-toolbar"><label>支出月份<input type="month"></label><button class="primary-action">新增支出</button></div></div><div class="expenses-summary"><article><strong>$1,234.56</strong></article></div><article class="expenses-item"><div></div><div class="expenses-item-actions"><button class="table-action">编辑</button></div></article></section></main>', [panel(".expenses-filter"), panel(".expenses-summary article"), field("input"), single(".expenses-summary"), [".expenses-item", { "flex-direction": "column" }]]],
  ["日结", "/finance", `<main class="app-shell finance-shell"><div class="closing-delivery-panel"><div>发送状态</div><button class="primary-action">发送全部小结</button></div><div class="warning-list"><article>待付款</article></div>${table}</main>`, [single(".closing-delivery-panel"), single(".warning-list"), touch(".primary-action")]],
  ["我的日结", "/finance", `<main class="app-shell finance-shell"><section class="personal-cash-settlement">${table}<button class="secondary-action">查看现金</button></section></main>`, [[".table-scroll", { "overflow-x": "auto" }], touch(".secondary-action")]],
  ["礼物卡", "/finance", `<main class="app-shell finance-shell">${filter}<div class="gift-card-ledger__usage-list"><article><div>销售</div><div>核销</div></article></div>${table}</main>`, [panel(".filter-panel"), field("input"), [".gift-card-ledger__usage-list article", { "flex-direction": "column" }]]],
  ["工资结算", "/finance", '<main class="app-shell finance-shell"><section class="employee-settlement-panel"><div class="settlement-selection-layout has-preview"><aside class="settlement-selection-sidebar"><div class="settlement-employee-buttons"><button>员工</button></div></aside><div class="settlement-calendar-column"><div class="settlement-calendar"></div></div><section class="employee-settlement-preview settlement-preview-compact"><div class="employee-settlement-summary mode-single"><article><span>工资总额</span><strong>$1,234.56</strong></article></div><section class="settlement-payment"><div class="settlement-payment-amounts"><article><span>已发放</span><strong>$0.00</strong></article><label>本次支付<input inputmode="decimal"></label></div></section><div class="settlement-preview-footer"><div class="employee-settlement-send-actions"><button class="primary-action">确认支付 / Confirm payment</button><button class="secondary-action">发送结算单</button></div></div></section></div><div class="payroll-fields"><label>工资<input></label></div></section></main>', [panel(".employee-settlement-panel"), single(".settlement-selection-layout"), single(".employee-settlement-summary"), single(".settlement-payment-amounts"), field(".settlement-payment input"), touch(".employee-settlement-send-actions button"), single(".payroll-fields")]],
  ["店铺设置", "/manage", `<main class="app-shell manage-shell">${tabs}<section class="manage-section store-settings-layout"><form class="manage-card">${form}<button class="primary-action">保存</button></form></section></main>`, [panel(".manage-card"), single(".store-settings-layout"), single(".manage-form-grid"), field("input"), field("select"), [".section-tabs button", { "border-radius": "0px" }]]],
  ["成员目录", "/manage", '<main class="app-shell manage-shell"><div class="members-master-detail"><aside class="members-directory"><div class="members-toolbar"><div class="members-toolbar__controls"><label class="members-search"><input type="search"></label><select><option>全部角色</option></select></div></div><div class="members-roster"><button class="members-roster-item"><span class="members-identity"><strong>Long employee name</strong></span></button></div></aside><section class="member-detail"></section></div></main>', [panel(".members-directory"), field("input"), [".member-detail", { "display": "none" }], [".members-roster", { "max-height": "none" }]]],
  ["成员详情", "/manage", '<main class="app-shell manage-shell"><div class="members-master-detail has-selection"><aside class="members-directory"></aside><section class="member-detail"><button class="member-detail__back table-action">返回员工列表</button><form class="member-sheet__body"><fieldset class="member-settings-group"><legend>日结短信</legend><div class="member-settings-group__body"><div class="member-settings-grid"><label>短信号码<input type="tel"><small>号码说明</small></label><label>图片语言<select><option>使用店铺默认</option></select></label></div></div></fieldset></form></section></div></main>', [panel(".member-detail"), [".members-directory", { "display": "none" }], [".member-detail__back", { "display": "inline-flex" }], [".member-settings-grid label", { "display": "flex", "flex-direction": "column", "align-self": "start" }], field("input"), field("select")]],
  ["项目与提成", "/manage", `<main class="app-shell manage-shell"><section class="manage-card"><section class="catalog-group"><form class="catalog-create catalog-create--service">${form}</form><div class="catalog-edit-panel catalog-edit-panel--service">${form}</div></section></section></main>`, [panel(".manage-card"), single(".catalog-create"), single(".catalog-edit-panel"), field("input")]],
  ["记工机器人", "/manage", '<main class="app-shell manage-shell"><section class="manage-section work-bot-panel"><section class="manage-card"><textarea>用语</textarea></section><section class="manage-card"><div class="work-bot-member"><div class="work-bot-member__identity">员工</div><span class="work-bot-member__status">空闲</span><div class="work-bot-member__actions"><button class="table-action">核实身份并开启数据访问</button><button class="table-action">解除</button></div></div></section></section></main>', [panel(".manage-card"), [".work-bot-panel", { "grid-template-columns": ["1fr", "minmax(0, 1fr)", ""] }], touch(".table-action")]],
  ["业务回收站", "/manage", `<main class="app-shell manage-shell"><section class="manage-section"><section class="manage-card">${responsiveRecords}</section></section></main>`, [panel(".manage-card"), panel(".mobile-data-card"), [".desktop-data-view", { "display": "none" }], [".mobile-data-view", { "display": "block" }], [".record-facts dd", { "font-size": ["1rem", "16px"], "white-space": "normal" }], touch(".table-action")]],
  ["审计记录", "/manage", '<main class="app-shell manage-shell"><section class="manage-card"><form class="audit-filters"><label>日期<input type="date"></label><label>操作<select><option>全部</option></select></label></form><div class="audit-detail"><div><section><pre>Previous state</pre></section><section><pre>Next state</pre></section></div></div></section></main>', [panel(".manage-card"), field("input"), field("select"), single(".audit-detail > div"), [".audit-detail pre", { "overflow": "auto" }]]],
  ["个人资料", "/profile", `<main class="app-shell manage-shell"><section class="manage-section profile-layout"><aside class="profile-summary"></aside><form class="manage-card">${form}<div class="password-form-grid"><label>密码<input type="password"></label></div></form></section></main>`, [panel(".manage-card"), single(".profile-layout"), single(".password-form-grid"), field("input")]],
  ["AI 助手", "/assistant", '<main class="app-shell"><section class="assistant-layout"><aside class="assistant-examples"></aside><section class="chat-panel"><form class="chat-composer"><textarea></textarea><div class="composer-actions"><button class="voice-button">语音输入</button><button class="primary-action">发送</button></div></form></section></section></main>', [panel(".chat-panel"), single(".assistant-layout"), touch(".voice-button"), touch(".primary-action")]],
  ["登录", "/login", '<main class="login-page"><section class="login-intro"></section><section class="login-card"><form><div class="phone-field"><span>+1</span><input type="tel"></div><button class="primary-action">登录</button></form></section></main>', [panel(".login-card"), single(".login-page"), [".phone-field", { height: "44px", "border-radius": "6px" }], ["input", { "font-size": "16px", "min-height": "0px" }], touch(".primary-action")]],
  ["初始化", "/", `<main class="center-page"><section class="setup-card"><div class="choice-grid"><button>创建店铺</button><button>加入店铺</button></div><div class="setup-line setup-line--service">${form}</div><div class="setup-price-option-row"><input><input><button class="danger-link">移除</button></div></section></main>`, [panel(".setup-card"), single(".choice-grid"), single(".setup-line"), field("input")]],
  ["使用帮助", "/help", '<main class="help-shell"><div class="help-grid"><details class="help-card" open><summary>使用指南</summary><p>说明</p></details></div></main>', [panel(".help-card"), single(".help-grid")]],
  ["离线", "/offline", '<main class="center-page"><section class="setup-card"><a class="primary-action offline-refresh">联网后刷新页面</a></section></main>', [panel(".setup-card"), touch(".primary-action")]],
  ["卖卡/跑客状态", "/", `<main class="app-shell">${projectStates}</main>`, [single(".board-store-projects"), panel(".gift-card-sales"), panel(".lost-customers")]],
  ["记工编辑弹层", "/", '<div class="modal-backdrop"><section class="record-editor"><div class="editor-grid"><label class="field-label">大费<input inputmode="decimal"></label><label class="field-label">项目<select><option>服务</option></select></label></div><div class="editor-actions"><button class="delete-record">删除</button><div class="editor-save-actions"><button class="save-record">保存</button></div></div></section></div>', [single(".editor-grid"), field("input"), field("select"), touch(".delete-record"), touch(".save-record")]],
  ["每周排工弹层", "/", '<dialog class="board-delivery-dialog weekly-dispatch-dialog" open><div class="modal-heading"><button class="close-button">关闭</button></div><div class="weekly-dispatch-table-wrap"><table class="weekly-dispatch-table"><tbody><tr><td><input type="checkbox"></td></tr></tbody></table></div><div class="modal-actions"><button class="primary-action">保存</button></div></dialog>', [[".weekly-dispatch-table-wrap", { "overflow": "auto" }], touch(".close-button"), touch(".primary-action")]],
  ["成员确认弹层", "/manage", '<dialog class="member-sheet" open><form class="member-sheet__body"><fieldset class="member-settings-group"><div class="member-settings-group__body"><label>姓名<input></label></div></fieldset></form><div class="member-sheet__footer"><button class="primary-action">保存员工</button></div></dialog>', [[".member-sheet", { "border-radius": "12px", "display": "flex", "overflow": "hidden" }], field("input"), touch(".primary-action")]],
  ["浮动助手", "/", '<div class="ai-dialog-root"><section class="floating-ai-dialog"><form class="chat-composer floating-ai-composer"><textarea></textarea><div class="composer-actions"><button class="voice-button">语音输入</button><button class="primary-action">发送</button></div></form></section></div>', [["textarea", { "font-size": "16px" }], touch(".voice-button"), touch(".primary-action")]],
  ["手机导航", "/", `<main class="app-shell"><div class="app-nav-space"><nav class="bottom-nav"><div class="app-nav-links app-nav-links--with-ai">${Array.from({ length: 5 }, () => '<div class="app-nav-group"><a class="bottom-nav__item"><span class="app-nav-label">店铺设置 / Store settings</span></a></div>').join("")}</div></nav></div></main>`, [[".app-nav-links", { "grid-template-columns": "repeat(5, minmax(0, 1fr))" }], [".app-nav-label", { "display": "inline" }], touch(".bottom-nav__item")]],
];

function mediaMatches(query, width) {
  return query.split(",").some((branch) => {
    if (/prefers-reduced-motion|hover:\s*hover|pointer:\s*fine/.test(branch)) return false;
    return Array.from(branch.matchAll(/\((min|max)-width:\s*([\d.]+)px\)/g))
      .every(([, bound, value]) => bound === "min" ? width >= Number(value) : width <= Number(value));
  });
}

export function stylesAtWidth(sources, width) {
  const trees = sources.map(({ name, css }) => postcss.parse(css, { from: name }));
  const tokens = {};
  for (const tree of trees) tree.walkRules(":root", (rule) => rule.walkDecls((decl) => { tokens[decl.prop] = decl.value; }));
  const substitute = (value) => {
    for (let i = 0; i < 10 && /var\(/.test(value); i++) value = value.replace(/var\((--[\w-]+)(?:,\s*([^()]+))?\)/g, (original, key, fallback) => tokens[key] ?? fallback ?? original);
    return value;
  };
  const rules = [];
  for (const tree of trees) tree.walkRules((rule) => {
    for (let parent = rule.parent; parent?.type !== "root"; parent = parent?.parent) {
      if (parent.type === "atrule" && (parent.name !== "media" || !mediaMatches(parent.params, width))) return;
    }
    // jsdom applies one specificity to comma groups; split them to match CSS cascade semantics.
    for (const selector of rule.selectors) {
      const copy = rule.clone({ selector });
      copy.walkDecls((decl) => { decl.value = substitute(decl.value); });
      rules.push(copy.toString());
    }
  });
  return rules.join("\n");
}

export function checkMobileUi(sources, widths = mobileWidths) {
  const issues = [];
  for (const width of widths) {
    const dom = new JSDOM(`<style>${stylesAtWidth(sources, width)}</style>${mobileScreens.map(([name, , html], i) => `<div data-screen="${i}" aria-label="${name}">${html}</div>`).join("")}`);
    try {
      for (const [index, [name, , , checks]] of mobileScreens.entries()) {
        const screen = dom.window.document.querySelector(`[data-screen="${index}"]`);
        for (const [selector, properties] of checks) {
          // Desktop-like grids above 600px are intentional on wider landscape phones.
          if (width > 600 && [".board-store-projects", ".warning-list", ".gift-card-ledger__usage-list article", ".payroll-fields", ".catalog-create", ".catalog-edit-panel", ".audit-detail > div", ".choice-grid", ".setup-line", ".editor-grid"].includes(selector)) continue;
          if (width > 600 && name === "经营分析" && selector === ".filter-panel") continue;
          if (width > 700 && selector === ".help-grid") continue;
          const elements = screen.querySelectorAll(selector);
          if (!elements.length) throw new Error(`${name}: missing fixture selector ${selector}`);
          for (const element of elements) {
            const style = dom.window.getComputedStyle(element);
            for (const [property, expected] of Object.entries(properties)) {
              const actual = style.getPropertyValue(property);
              const matches = expected?.min !== undefined
                ? actual.endsWith("px") && Number.parseFloat(actual) >= expected.min
                : (Array.isArray(expected) ? expected : [expected]).includes(actual);
              if (!matches) issues.push(`${width}px ${name} ${selector}: ${property} = ${actual}, expected ${JSON.stringify(expected)}`);
            }
          }
        }
      }
    } finally { dom.window.close(); }
  }
  return issues;
}

async function main() {
  const pages = (await readdir(resolve(root, "apps/web/app"), { recursive: true })).filter((name) => /(^|\/)page\.tsx$/.test(name));
  const covered = new Set(mobileScreens.map(([, route]) => route));
  for (const page of pages) {
    const route = page === "page.tsx" ? "/" : `/${dirname(page)}`;
    if (!covered.has(route)) throw new Error(`Mobile UI fixture missing for route ${route}`);
  }
  const sources = await Promise.all(uiStyleFiles.map(async (name) => ({ name, css: await readFile(resolve(root, "apps/web/app", name), "utf8") })));
  const issues = checkMobileUi(sources);
  if (issues.length) throw new Error(`Mobile UI styles failed:\n${issues.join("\n")}`);
  console.log(`手机样式检查通过：${pages.length} 个路由、${mobileScreens.length} 组页面/分区，${mobileWidths.join("/")}px。代码检查不包含浏览器视觉验收。`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
