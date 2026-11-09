const esc = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!)

const icons = {
  repo: '<rect x="3" y="2" width="10" height="12" rx="1"/><path d="M3 11h10M6 5h4"/>',
  code: '<path d="M6 4 2 8l4 4m4-8 4 4-4 4"/>',
  issue: '<circle cx="8" cy="8" r="6"/><path d="M8 5v3m0 2v1"/>',
  pull: '<circle cx="4" cy="3" r="1.5"/><circle cx="4" cy="13" r="1.5"/><circle cx="12" cy="13" r="1.5"/><path d="M4 4.5v7m5-8h1a2 2 0 0 1 2 2v6M7 3.5l2-2m-2 2 2 2"/>',
  branch: '<circle cx="4" cy="3" r="1.5"/><circle cx="4" cy="13" r="1.5"/><circle cx="12" cy="3" r="1.5"/><path d="M4 4.5v7m8-7v1a3 3 0 0 1-3 3H4"/>',
  folder: '<path d="M2 4h5l1.5 2H14v7H2z" fill="currentColor" stroke-linejoin="round"/>',
  file: '<path d="M4 2h5l3 3v9H4zm5 0v4h3"/>',
  book: '<path d="M8 4C6 2.5 4 2.5 2 3v9c2-.5 4-.5 6 1 2-1.5 4-1.5 6-1V3c-2-.5-4-.5-6 1zm0 0v9"/>',
  search: '<circle cx="7" cy="7" r="4"/><path d="m10 10 4 4"/>',
} as const
const icon = (name: keyof typeof icons) => `<svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35">${icons[name]}</svg>`

export function repositoryHeader(repository: string, active?: 'code' | 'issues' | 'pulls') {
  const [owner = 'mock', name = 'repo'] = repository.split('/')
  const tabs = [['code', 'Code', '/github', 'code'], ['issues', 'Issues', '/github?tab=issues', 'issue'],
    ['pulls', 'Pull requests', '/github?tab=pulls', 'pull']] as const
  return `<header class="gh-header"><div class="gh-wrap">
  <div class="gh-identity">${icon('repo')}<span>${esc(owner)}</span><span class="gh-muted">/</span><h1><a href="/github">${esc(name)}</a></h1><span class="gh-pill">Local sandbox</span></div>
  <nav class="gh-tabs" aria-label="仓库导航">${tabs.map(([key, label, href, glyph]) => `<a href="${href}" data-repo-tab="${key}"${active === key ? ' aria-current="page"' : ''}>${icon(glyph)}${label}</a>`).join('')}</nav>
  </div></header>`
}

const fileUrl = (path: string, kind: 'tree' | 'blob' | 'raw' = 'blob') =>
  `/github/${kind}/main/${path.split('/').map(encodeURIComponent).join('/')}`
const dirUrl = (path: string) => path ? fileUrl(path, 'tree') : '/github'

function markdown(source: string) {
  const inline = (value: string) => esc(value).replace(/`([^`]+)`/g, '<code>$1</code>')
  const blocks: string[] = []
  let list: string[] = []
  const flush = () => { if (list.length) { blocks.push(`<ul>${list.join('')}</ul>`); list = [] } }
  for (const line of source.trim().split('\n')) {
    if (line.startsWith('- ')) { list.push(`<li>${inline(line.slice(2))}</li>`); continue }
    flush()
    if (line.startsWith('# ')) blocks.push(`<h2>${inline(line.slice(2))}</h2>`)
    else if (line.startsWith('## ')) blocks.push(`<h3>${inline(line.slice(3))}</h3>`)
    else if (line.trim()) blocks.push(`<p>${inline(line)}</p>`)
  }
  flush()
  return blocks.join('')
}

export function repositoryContent(options: { repository: string; files: Readonly<Record<string, string>>; path: string; view: 'tree' | 'blob'; source?: boolean }) {
  const { repository, files, path, view, source } = options
  const names = Object.keys(files).sort()
  const content = view === 'blob' && Object.hasOwn(files, path) ? files[path] : undefined
  const exists = view === 'tree' ? !path || names.some(file => file.startsWith(`${path}/`)) : content !== undefined
  const parts = path ? path.split('/') : []
  const parent = parts.slice(0, -1).join('/')
  const base = path ? `${path}/` : ''
  const entries = new Map<string, boolean>()
  for (const file of names.filter(file => file.startsWith(base))) {
    const [name, ...child] = file.slice(base.length).split('/')
    if (name) entries.set(name, child.length > 0)
  }
  const crumbs = `<nav class="gh-crumbs" aria-label="文件路径"><a href="/github">${esc(repository.split('/').at(-1)!)}</a>${parts.map((part, index) => {
    const last = index === parts.length - 1
    return `<span class="gh-muted">/</span>${last ? `<strong>${esc(part)}</strong>` : `<a href="${dirUrl(parts.slice(0, index + 1).join('/'))}">${esc(part)}</a>`}`
  }).join('')}</nav>`
  const folder = `<section class="gh-card" aria-label="目录内容"><div class="gh-card-head">${icon('branch')}<strong>main</strong><span class="gh-muted">示例仓库文件</span></div>
    ${path ? `<a class="gh-file" href="${dirUrl(parent)}" aria-label="上一级目录">${icon('folder')}<span>..</span></a>` : ''}
    ${[...entries].sort(([a, aDir], [b, bDir]) => Number(bDir) - Number(aDir) || a.localeCompare(b)).map(([name, isDir]) =>
      `<a class="gh-file" href="${isDir ? dirUrl(base + name) : fileUrl(base + name)}">${icon(isDir ? 'folder' : 'file')}<span>${esc(name)}</span>${isDir ? '' : `<small>${new TextEncoder().encode(files[base + name]).length} B</small>`}</a>`).join('')}</section>`
  const preview = (readme: string) => `<article class="gh-markdown">${markdown(readme)}</article>`
  const readme = !path && files['README.md'] ? `<section class="gh-card gh-readme"><div class="gh-card-head">${icon('book')}<h2>README</h2></div>${preview(files['README.md'])}</section>` : ''
  let body = folder + readme
  if (content !== undefined) {
    const lines = content.replace(/\n$/, '').split('\n')
    const isMd = path.endsWith('.md')
    body = `<section class="gh-card" aria-label="文件内容"><div class="gh-card-head gh-file-head"><div class="gh-view-tabs">${isMd
      ? `<a href="${fileUrl(path)}"${source ? '' : ' aria-current="page"'}>Preview</a><a href="${fileUrl(path)}?view=source"${source ? ' aria-current="page"' : ''}>Code</a>`
      : '<strong>Code</strong>'}</div><span class="gh-muted">${lines.length} 行 · ${new TextEncoder().encode(content).length} B</span>
      <div class="gh-file-actions"><a class="gh-button" href="${fileUrl(path, 'raw')}">Raw</a></div></div>
      ${isMd && !source ? preview(content) : `<div class="gh-source"><table aria-label="源代码"><tbody>${lines.map((line, index) => `<tr id="L${index + 1}"><td><a href="#L${index + 1}" aria-label="第 ${index + 1} 行">${index + 1}</a></td><td><code>${esc(line) || ' '}</code></td></tr>`).join('')}</tbody></table></div>`}</section>`
  }
  return repositoryHeader(repository, 'code') + `<main class="gh-wrap gh-main">
    <div class="gh-tools"><span class="gh-button gh-branch">${icon('branch')}<strong>main</strong></span>${crumbs}
      <details class="gh-finder"><summary class="gh-button">${icon('search')}Go to file</summary><div><label>查找文件<input id="gh-file-search" type="search" placeholder="输入文件名或路径"></label><ul id="gh-file-results">${names.map(file => `<li><a href="${fileUrl(file)}">${icon('file')}${esc(file)}</a></li>`).join('')}</ul><p id="gh-file-empty" hidden>没有匹配的文件</p></div></details>
    </div>
    <div class="gh-layout${path ? ' gh-nested' : ''}"><div>${exists ? body : `<div class="gh-card gh-error"><h2>找不到此路径</h2><p>${esc(path)}</p><a href="/github">返回仓库</a></div>`}</div>
      <aside class="gh-about"><h2>About</h2><p>Billing Desk · 虚拟账单管理项目</p><div>${icon('book')}<a href="${fileUrl('README.md')}">Readme</a></div><div>${icon('file')}<span>${names.length} 个示例文件</span></div><p class="gh-muted">SuperAgent 沙箱 · 供 Worker 读取的示例代码</p></aside>
    </div>
  </main><script>
  document.title = ${JSON.stringify(`${path || repository} · 虚拟 GitHub`).replace(/</g, '\\u003c')};
  document.body.classList.add('gh-page');
  document.getElementById('github-link').setAttribute('aria-current','page');
  document.getElementById('pause').hidden = true;
  const finder = document.querySelector('.gh-finder');
  const input = document.getElementById('gh-file-search');
  const entries = [...document.querySelectorAll('#gh-file-results li')];
  finder.addEventListener('toggle', () => { if (finder.open) input.focus(); });
  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    for (const entry of entries) entry.hidden = !entry.textContent.toLowerCase().includes(query);
    document.getElementById('gh-file-empty').hidden = entries.some(entry => !entry.hidden);
  });
  finder.addEventListener('keydown', event => {
    if (event.key === 'Escape') { finder.open = false; finder.querySelector('summary').focus(); }
    if (event.key === 'Enter' && event.target === input) entries.find(entry => !entry.hidden)?.querySelector('a').click();
  });
  </script></body></html>`
}

export const GITHUB_STYLE = String.raw`
.gh-page{--gh-bg:#0d1117;--gh-panel:#151b23;--gh-border:#30363d;--gh-fg:#f0f6fc;--gh-subtle:#9198a1;--gh-link:#4493f8;background:var(--gh-bg);color:var(--gh-fg);font-family:system-ui,"Microsoft YaHei",sans-serif}
.gh-header{background:#010409;border-bottom:1px solid var(--gh-border)}
.gh-wrap{max-width:1270px;margin:auto;padding-inline:clamp(12px,3vw,32px)}
.gh-identity{display:flex;align-items:center;gap:8px;padding:17px 0 11px;font-size:18px}.gh-identity h1{font-size:inherit}.gh-identity a{color:var(--gh-fg);text-decoration:none}.gh-identity a:hover{text-decoration:underline}
.gh-header svg,.gh-main svg{width:16px;height:16px;flex:0 0 16px;color:var(--gh-subtle)}
.gh-pill{padding:0 7px;margin-left:2px;font-size:11px;font-weight:600;color:var(--gh-subtle);border:1px solid var(--gh-border);border-radius:100px}
.gh-tabs{display:flex;flex-wrap:wrap;gap:4px}.gh-tabs a{display:flex;align-items:center;gap:7px;border-bottom:2px solid transparent;color:var(--gh-fg);padding:8px 12px;text-decoration:none}.gh-tabs a:hover{background:#151b23}.gh-tabs a[aria-current]{border-bottom-color:#f78166;font-weight:650}
.gh-main{padding-top:22px;padding-bottom:24px}.gh-tools{display:flex;align-items:center;gap:9px;margin-bottom:14px;flex-wrap:wrap}
.gh-button{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;min-height:32px;border:1px solid var(--gh-border);border-radius:6px;background:#212830;color:var(--gh-fg);text-decoration:none;font-size:13px}.gh-button:hover{background:#2a313c}.gh-branch{cursor:default}.gh-muted{color:var(--gh-subtle)}
.gh-crumbs{display:flex;gap:7px;align-items:center;flex-wrap:wrap;min-width:0;overflow-wrap:anywhere;font-size:15px}.gh-main a:not(.gh-button){color:var(--gh-link)}
.gh-finder{position:relative;margin-left:auto}.gh-finder summary{list-style:none}.gh-finder>div{position:absolute;z-index:3;right:0;top:calc(100% + 5px);width:min(340px,82vw);background:var(--gh-panel);border:1px solid var(--gh-border);border-radius:8px;box-shadow:0 8px 18px #0007;padding:9px}
.gh-finder label{display:grid;gap:4px;font-size:12px;color:var(--gh-subtle)}.gh-finder input{padding:6px 9px;background:var(--gh-bg);border:1px solid var(--gh-border);border-radius:6px;color:var(--gh-fg)}.gh-finder ul{list-style:none;padding:0;margin:6px 0 0}.gh-finder li a{display:flex;gap:7px;padding:5px 7px;overflow-wrap:anywhere;text-decoration:none}.gh-finder li a:hover{background:#212830}
.gh-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(175px,24%);gap:24px;align-items:start}.gh-nested{grid-template-columns:minmax(0,1fr)}.gh-nested .gh-about{display:none}
.gh-card{min-width:0;border:1px solid var(--gh-border);border-radius:7px;overflow:hidden}.gh-card-head{padding:8px 13px;display:flex;align-items:center;gap:8px;background:var(--gh-panel);border-bottom:1px solid var(--gh-border);min-height:43px}.gh-card-head h2{font-size:14px}.gh-card-head .gh-muted{font-size:12px}
.gh-main a.gh-file{display:grid;grid-template-columns:16px minmax(0,1fr) auto;align-items:center;gap:9px;padding:9px 13px;color:var(--gh-fg);text-decoration:none;overflow-wrap:anywhere}.gh-file:hover{background:var(--gh-panel)}.gh-file + .gh-file{border-top:1px solid #21262d}.gh-file:hover span{text-decoration:underline;color:var(--gh-link)}.gh-file small{color:var(--gh-subtle)}
.gh-readme{margin-top:16px}.gh-markdown{padding:18px clamp(14px,4vw,32px) 22px;font-size:14px}.gh-markdown h2{font-size:24px;border-bottom:1px solid var(--gh-border);padding-bottom:6px;margin-bottom:10px}.gh-markdown h3{margin:12px 0 5px}.gh-markdown p{margin:6px 0}.gh-markdown code{background:#212830;border-radius:4px;padding:2px 4px}
.gh-about h2{font-size:16px;margin-bottom:7px}.gh-about p{margin-bottom:9px}.gh-about div{display:flex;gap:7px;align-items:center;color:var(--gh-subtle);margin-bottom:5px}.gh-about .gh-muted{margin-top:10px;font-size:12px}
.gh-file-head{flex-wrap:wrap}.gh-view-tabs{display:flex;align-items:center;gap:6px;font-size:12px}.gh-view-tabs a{padding:3px 7px;text-decoration:none}.gh-view-tabs a[aria-current]{background:#212830;border-radius:5px;color:var(--gh-fg);font-weight:650}.gh-file-actions{margin-left:auto}
.gh-source{overflow:auto;padding:8px 0 12px;font:12px/1.65 var(--mono)}.gh-source table{border-collapse:collapse;min-width:100%}.gh-source td{white-space:pre}.gh-source td:first-child{text-align:right;user-select:none;width:45px;padding:0 12px}.gh-source td:first-child a{color:var(--gh-subtle);text-decoration:none}.gh-source td:last-child{padding-right:15px}.gh-source tr:target{background:#322b14}.gh-error{padding:20px}.gh-error p{overflow-wrap:anywhere;margin-bottom:8px}
@media(max-width:680px){.gh-layout{grid-template-columns:minmax(0,1fr);gap:15px}.gh-about{padding:12px;border:1px solid var(--gh-border);border-radius:7px}.gh-main{padding-top:13px}.gh-tabs a{padding:7px 8px}.gh-identity{padding-top:12px}}
`
