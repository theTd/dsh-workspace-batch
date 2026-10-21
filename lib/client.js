// dsh-workspace-batch — 浏览器半边（手写 ModuleLoader bundle，无构建步骤）。
//
// 侧边栏底部放一个入口按钮，点开一个浮层对话框，列出全部 Workspace 并支持
// 勾选后批量移除登记。
//
// 语义边界（必须与宿主一致）：
//   `WorkspaceRegistry.delete(id)` 只删「登记行 + 顺序项」，
//   **不删目录、不删会话日志**；原本属于它的会话会落到侧边栏的「未分组」。
//   宿主侧不存在「会话正在运行所以拒绝删除」的闸门（那是 archive 的语义），
//   所以这里也不发明一个；本插件只如实说明后果。
//
// 契约来源（均为公开面，不 require 任何内置 Client 包）：
//   ctx.slots.inject(name, () => ctx.slots.register({name, id, order}, Component))
//   ctx.workspaces.list.getSnapshot() / .subscribe(fn) / ctx.workspaces.delete(id)
//
// 样式自持：全部走 `--dsw-alias-*` 主题变量，类名统一 `dswsb-` 前缀，
// 不读写宿主 DOM，不向 document.body 追加节点。

window.__ModuleLoader__.load({
  id: 'dsh-workspace-batch',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;

    const useSyncExternalStore =
      React.useSyncExternalStore ||
      // React <18 兜底：够用的等价实现，只在本插件里用。
      function (subscribe, getSnapshot) {
        const [value, setValue] = React.useState(getSnapshot);
        React.useEffect(() => {
          const sync = () => setValue(() => getSnapshot());
          sync();
          return subscribe(sync);
        }, [subscribe, getSnapshot]);
        return value;
      };

    /* ---------------------------------------------------------------- store */

    /** 极小的外部 store：让侧边栏按钮与浮层对话框共享「是否打开」。 */
    function createFlag(initial) {
      let value = initial;
      const listeners = new Set();
      return {
        get: () => value,
        set(next) {
          if (value === next) return;
          value = next;
          for (const fn of listeners) fn();
        },
        subscribe(fn) {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
      };
    }

    /* ------------------------------------------------------------------ i18n */

    // 文案走客户端的 locale 服务：`ctx.locale.register(ns, locale, dict)` 注册字典，
    // 槽位注册带上 `locale: NS` 后会收到绑定到该命名空间的 `t` 座位，语言在
    // 设置里切换时会重新渲染。查不到键时先退到 common 命名空间，再退回键名本身。
    const NS = 'workspace-batch';
    const DASH = '—';

    const DICTS = {
      en: {
        open: 'Manage workspaces',
        title: 'Manage workspaces',
        close: 'Close',
        desc: 'Only the sidebar entry is removed. Folders are not deleted and session logs are kept; sessions move to “Ungrouped”.',
        filter: 'Filter by title or path',
        selectAll: 'Select visible',
        clear: 'Clear',
        selectZero: 'Select zero-session',
        clearZero: 'Deselect zero-session',
        selectZeroHint: 'Select workspaces in the current filter that have no unarchived sessions',
        empty: 'No workspaces to manage',
        loading: 'Loading workspaces…',
        failedLoadDetail: 'Could not load workspaces: {message}',
        sessions: '{n} sessions',
        sessionsDetail: '{visible} visible, {archived} archived',
        selected: '{n} selected',
        cancel: 'Cancel',
        remove: 'Remove selected',
        confirmTitle: 'Remove {n} workspaces?',
        confirmHint: 'This cannot be undone, but the same folder can be added again.',
        back: 'Back',
        confirm: 'Remove',
        deleting: 'Removing…',
        doneFail: 'Removed {ok}, {bad} failed',
        rowDeleting: 'Removing…',
        rowFailed: 'Failed',
        noMatch: 'No matching workspaces',
        'time.justNow': 'just now',
        'time.minutes': '{n} min ago',
        'time.hours': '{n} h ago',
        'time.days': '{n} d ago',
      },
      zh: {
        open: '批量管理工作区',
        title: '批量管理工作区',
        close: '关闭',
        desc: '只移除侧边栏里的登记行。目录不会被删除，会话日志也会保留，相关会话会移到「未分组」。',
        filter: '按标题或路径筛选',
        selectAll: '全选可见',
        clear: '清空',
        selectZero: '选零会话',
        clearZero: '取消零会话',
        selectZeroHint: '选中当前筛选结果里未归档会话数为 0 的工作区',
        empty: '没有可管理的工作区',
        loading: '正在读取工作区…',
        failedLoadDetail: '工作区列表加载失败：{message}',
        sessions: '{n} 个会话',
        sessionsDetail: '可见 {visible} 个会话，另有 {archived} 个已归档',
        selected: '已选 {n} 项',
        cancel: '取消',
        remove: '移除所选',
        confirmTitle: '确认移除 {n} 个工作区？',
        confirmHint: '此操作不可撤销，但可以重新添加同一目录。',
        back: '返回',
        confirm: '确认移除',
        deleting: '正在移除…',
        doneFail: '已移除 {ok} 个，失败 {bad} 个',
        rowDeleting: '移除中…',
        rowFailed: '失败',
        noMatch: '没有匹配的工作区',
        'time.justNow': '刚刚',
        'time.minutes': '{n} 分钟前',
        'time.hours': '{n} 小时前',
        'time.days': '{n} 天前',
      },
    };

    /* -------------------------------------------------------------- utilities */

    function formatTime(iso, t) {
      if (!iso) return DASH;
      const then = Date.parse(iso);
      if (!Number.isFinite(then)) return DASH;
      const diff = Date.now() - then;
      const min = Math.round(diff / 60000);
      if (min < 1) return t('time.justNow');
      if (min < 60) return t('time.minutes', { n: min });
      const hours = Math.round(min / 60);
      if (hours < 24) return t('time.hours', { n: hours });
      const days = Math.round(hours / 24);
      if (days < 30) return t('time.days', { n: days });
      return new Date(then).toLocaleDateString();
    }

    function messageOf(error) {
      if (error && typeof error === 'object' && typeof error.message === 'string') return error.message;
      return String(error);
    }

    /* ------------------------------------------------------------ components */

    function IconListCheck() {
      return h(
        'svg',
        {
          width: 14,
          height: 14,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('path', { d: 'M2 4h7M2 8h5M2 12h4' }),
        h('path', { d: 'M10.5 10.5l2 2 3.5-4' }),
      );
    }

    function IconClose() {
      return h(
        'svg',
        { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', 'aria-hidden': true },
        h('path', { d: 'M4 4l8 8M12 4l-8 8' }),
      );
    }

    /** 侧边栏底部的入口按钮（只在找不到标题行锚点时作为兜底）。 */
    function FooterAction(props) {
      const open = useSyncExternalStore(props.openFlag.subscribe, props.openFlag.get);
      const wide = props.wide !== false;
      return h(
        'button',
        {
          type: 'button',
          className: 'dswsb-foot',
          title: props.t('open'),
          'aria-label': props.t('open'),
          'aria-pressed': open,
          'aria-haspopup': 'dialog',
          onClick: () => props.openFlag.set(true),
        },
        h(IconListCheck),
        wide ? h('span', null, props.t('open')) : null,
      );
    }

    // 工作区标题行里那个 `data-slot="sidebar.workspaces.directoryFlow"` 容器，是整行唯一
    // 一个按「槽位名」而不是按哈希类名标记的节点 —— 比 `bhn1Oq_headerActions` 稳定得多。
    //
    // 为什么不直接占这个槽位：它是目录选择流程的洞（owner 是
    // `{open, busy, onPicked, onCancel, onError}`，`single`），占了它，标题行的
    // 「Add workspace」按钮点下去就会弹我的对话框 —— 那是劫持，不是放置。
    const HEADER_ANCHOR = '[data-slot="sidebar.workspaces.directoryFlow"]';
    const SIDEBAR_SCOPE = '[data-slot="sidebar"]';

    /** 盯住标题行锚点：宿主重渲染换掉节点时重新指向，卸载时断开观察。 */
    function useHeaderAnchor() {
      const [target, setTarget] = React.useState(null);
      React.useEffect(() => {
        let observer = null;
        let scopedTo = null;
        const sync = () => {
          const next = document.querySelector(HEADER_ANCHOR);
          setTarget((prev) => (prev === next ? prev : next));
          // 侧边栏可能比插件晚挂载：锚点不在时先把观察收紧到侧边栏根上。
          const scope = document.querySelector(SIDEBAR_SCOPE) || document.body;
          if (scope !== scopedTo) {
            if (observer !== null) observer.disconnect();
            observer = new MutationObserver(sync);
            observer.observe(scope, { childList: true, subtree: true });
            scopedTo = scope;
          }
        };
        sync();
        return () => {
          if (observer !== null) observer.disconnect();
        };
      }, []);
      return target;
    }

    /**
     * 标题行的入口控件：定位到工作区标题行就 portal 过去（`display: contents`
     * 的槽位宿主），定位不到就退回侧边栏底部。
     *
     * portal 只能追加，所以位置用 flex `order` 控制：`--lead` 让它跑到标题行
     * 最左侧（"Workspaces" 标签之前），去掉这个类就回到最右侧。
     */
    function HeaderEntry(props) {
      const open = useSyncExternalStore(props.openFlag.subscribe, props.openFlag.get);
      const target = useHeaderAnchor();
      const [graceOver, setGraceOver] = React.useState(false);

      // 首帧侧边栏可能还没挂：给 1.2s 宽限，别让按钮先在底部闪一下再跳上去。
      React.useEffect(() => {
        if (target !== null) return undefined;
        const timer = setTimeout(() => setGraceOver(true), 1200);
        return () => clearTimeout(timer);
      }, [target]);

      if (target === null) {
        if (!graceOver) return null;
        return h(FooterAction, props);
      }

      return ReactDOM.createPortal(
        h(
          'button',
          {
            type: 'button',
            className: 'dswsb-iconbtn dswsb-iconbtn--lead',
            title: props.t('open'),
            'aria-label': props.t('open'),
            'aria-pressed': open,
            'aria-haspopup': 'dialog',
            onClick: () => props.openFlag.set(true),
          },
          h(IconListCheck),
        ),
        target,
      );
    }

    function WorkspaceRow(props) {
      const { workspace, checked, status, disabled, onToggle, counts, t } = props;
      const rowClass = ['dswsb-row', checked ? 'dswsb-row--checked' : '', status === 'failed' ? 'dswsb-row--failed' : '']
        .filter(Boolean)
        .join(' ');
      return h(
        'label',
        { className: rowClass },
        h('input', {
          type: 'checkbox',
          className: 'dswsb-check',
          checked,
          disabled,
          onChange: () => onToggle(workspace.workspaceId),
        }),
        h(
          'span',
          { className: 'dswsb-rowMain' },
          h('span', { className: 'dswsb-rowTitle', title: workspace.title }, workspace.title),
          h('span', { className: 'dswsb-rowPath', title: workspace.path }, workspace.path),
        ),
        h(
          'span',
          { className: 'dswsb-rowMeta' },
          status === 'deleting' ? h('span', { className: 'dswsb-pill' }, t('rowDeleting')) : null,
          status === 'failed' ? h('span', { className: 'dswsb-pill dswsb-pill--error' }, t('rowFailed')) : null,
          h(
            'span',
            {
              className: 'dswsb-pill',
              title:
                counts.archived > 0
                  ? t('sessionsDetail', { visible: counts.visible, archived: counts.archived })
                  : undefined,
            },
            t('sessions', { n: counts.visible }),
          ),
          h('span', { className: 'dswsb-time' }, formatTime(workspace.updatedAt || workspace.createdAt, t)),
        ),
      );
    }

    /** 浮层对话框：`shell.overlay` 的成员，未打开时返回 null。 */
    function BatchDialog(props) {
      const t = props.t;
      const open = useSyncExternalStore(props.openFlag.subscribe, props.openFlag.get);
      const service = props.service;
      const subscribe = React.useCallback((fn) => service.list.subscribe(fn), [service]);
      const getSnapshot = React.useCallback(() => service.list.getSnapshot(), [service]);
      const snapshot = useSyncExternalStore(subscribe, getSnapshot);

      const [query, setQuery] = React.useState('');
      const [selected, setSelected] = React.useState(() => new Set());
      const [phase, setPhase] = React.useState('pick'); // pick | confirm | deleting | done
      const [statusById, setStatusById] = React.useState({});
      const [failures, setFailures] = React.useState([]);
      const panelRef = React.useRef(null);

      const items = snapshot.items || [];
      const busy = phase === 'deleting';

      // 归档不会清掉 workspace 的会话槽位（`sessionIds` 一直保留），所以行上显示的是
      // **未归档**的数量：从会话集合里减掉 registry 全局归档集之后剩下的部分。
      const archivedSet = React.useMemo(
        () => new Set(snapshot.archivedSessionIds || []),
        [snapshot.archivedSessionIds],
      );
      const counts = React.useMemo(() => {
        const map = new Map();
        for (const item of items) {
          let archived = 0;
          for (const sessionId of item.sessionIds) {
            if (archivedSet.has(sessionId)) archived += 1;
          }
          map.set(item.workspaceId, { visible: item.sessionIds.length - archived, archived });
        }
        return map;
      }, [items, archivedSet]);

      // 每次打开都从干净状态开始。
      React.useEffect(() => {
        if (!open) return;
        setQuery('');
        setSelected(new Set());
        setPhase('pick');
        setStatusById({});
        setFailures([]);
      }, [open]);

      // 打开时把焦点交给面板，关闭时不做额外处理（宿主负责把焦点还给触发元素）。
      React.useEffect(() => {
        if (open && panelRef.current) panelRef.current.focus();
      }, [open]);

      const close = React.useCallback(() => {
        if (busy) return;
        props.openFlag.set(false);
      }, [busy, props.openFlag]);

      // Escape 关闭。挂在 document 上，capture 阶段，避免被输入框吞掉。
      React.useEffect(() => {
        if (!open) return undefined;
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return;
          if (busy) {
            event.preventDefault();
            return;
          }
          event.stopPropagation();
          close();
        };
        document.addEventListener('keydown', onKeyDown, true);
        return () => document.removeEventListener('keydown', onKeyDown, true);
      }, [open, busy, close]);

      const needle = query.trim().toLowerCase();
      const visible = React.useMemo(() => {
        if (!needle) return items;
        return items.filter(
          (item) =>
            item.title.toLowerCase().includes(needle) || item.path.toLowerCase().includes(needle),
        );
      }, [items, needle]);

      // 选中集合按「仍在列表里」的交集计数，避免外部删掉后数字虚高。
      const pickedIds = React.useMemo(() => items.filter((item) => selected.has(item.workspaceId)).map((item) => item.workspaceId), [items, selected]);
      const pickedCount = pickedIds.length;
      const allVisiblePicked = visible.length > 0 && visible.every((item) => selected.has(item.workspaceId));

      // 「零会话」按当前筛选结果算，跟行上显示的数字同一口径（未归档会话数为 0）。
      const zeroVisible = React.useMemo(
        () => visible.filter((item) => (counts.get(item.workspaceId) || { visible: 0 }).visible === 0),
        [visible, counts],
      );
      const allZeroPicked = zeroVisible.length > 0 && zeroVisible.every((item) => selected.has(item.workspaceId));

      const toggle = React.useCallback((id) => {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      }, []);

      const toggleAllVisible = React.useCallback(() => {
        setSelected((prev) => {
          const next = new Set(prev);
          if (allVisiblePicked) visible.forEach((item) => next.delete(item.workspaceId));
          else visible.forEach((item) => next.add(item.workspaceId));
          return next;
        });
      }, [allVisiblePicked, visible]);

      const toggleZero = React.useCallback(() => {
        setSelected((prev) => {
          const next = new Set(prev);
          if (allZeroPicked) zeroVisible.forEach((item) => next.delete(item.workspaceId));
          else zeroVisible.forEach((item) => next.add(item.workspaceId));
          return next;
        });
      }, [allZeroPicked, zeroVisible]);

      const runDelete = React.useCallback(async () => {
        const ids = items.filter((item) => selected.has(item.workspaceId)).map((item) => item.workspaceId);
        if (ids.length === 0) return;
        setPhase('deleting');
        setFailures([]);
        const initial = {};
        ids.forEach((id) => {
          initial[id] = 'queued';
        });
        setStatusById(initial);

        const failed = [];
        for (const id of ids) {
          setStatusById((prev) => ({ ...prev, [id]: 'deleting' }));
          try {
            // 宿主侧按 registry 队列串行化，这里逐个 await 只是为了让进度可读。
            await service.delete(id);
            setStatusById((prev) => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
          } catch (error) {
            failed.push({ id, message: messageOf(error) });
            setStatusById((prev) => ({ ...prev, [id]: 'failed' }));
          }
        }

        if (failed.length === 0) {
          // 全部成功：直接关窗。列表由 follow 流自行刷新，不需要等它。
          props.openFlag.set(false);
          setPhase('pick');
          return;
        }
        setFailures(failed);
        setPhase('done');
      }, [items, selected, service, props.openFlag]);

      if (!open) return null;

      const loading = snapshot.state === 'loading' || snapshot.phase === 'pending';
      const loadError = snapshot.error ? messageOf(snapshot.error) : null;

      const footer =
        phase === 'confirm'
          ? [
              h('span', { className: 'dswsb-count dswsb-count--warn', key: 'q' }, t('confirmTitle', { n: pickedCount })),
              h('button', { type: 'button', className: 'dswsb-btn', key: 'back', onClick: () => setPhase('pick') }, t('back')),
              h('button', { type: 'button', className: 'dswsb-btn dswsb-btn--danger', key: 'go', onClick: runDelete }, t('confirm')),
            ]
          : phase === 'deleting'
            ? [h('span', { className: 'dswsb-count', key: 'd' }, t('deleting'))]
            : phase === 'done'
              ? [
                  h(
                    'span',
                    { className: 'dswsb-count dswsb-count--error', key: 'f' },
                    t('doneFail', { ok: pickedCount - failures.length, bad: failures.length }),
                  ),
                  h('button', { type: 'button', className: 'dswsb-btn', key: 'c', onClick: close }, t('close')),
                ]
              : [
                  h('span', { className: 'dswsb-count', key: 'n' }, t('selected', { n: pickedCount })),
                  h('button', { type: 'button', className: 'dswsb-btn', key: 'x', onClick: close }, t('cancel')),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dswsb-btn dswsb-btn--danger',
                      key: 'r',
                      disabled: pickedCount === 0,
                      onClick: () => setPhase('confirm'),
                    },
                    t('remove'),
                  ),
                ];

      return h(
        'div',
        {
          className: 'dswsb-layer',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) close();
          },
        },
        h(
          'div',
          {
            className: 'dswsb-panel',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': t('title'),
            tabIndex: -1,
            ref: panelRef,
          },
          h(
            'div',
            { className: 'dswsb-head' },
            h('span', { className: 'dswsb-title' }, t('title')),
            h(
              'button',
              {
                type: 'button',
                className: 'dswsb-close',
                title: t('close'),
                'aria-label': t('close'),
                onClick: close,
                disabled: busy,
              },
              h(IconClose),
            ),
          ),
          h('p', { className: 'dswsb-desc' }, t('desc')),
          h(
            'div',
            { className: 'dswsb-toolbar' },
            h('input', {
              className: 'dswsb-input',
              type: 'search',
              placeholder: t('filter'),
              value: query,
              disabled: busy,
              onChange: (event) => setQuery(event.target.value),
            }),
            h(
              'button',
              { type: 'button', className: 'dswsb-btn dswsb-btn--sm', onClick: toggleAllVisible, disabled: busy || visible.length === 0 },
              allVisiblePicked ? t('clear') : t('selectAll'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dswsb-btn dswsb-btn--sm',
                onClick: toggleZero,
                disabled: busy || zeroVisible.length === 0,
                title: t('selectZeroHint'),
              },
              allZeroPicked ? t('clearZero') : t('selectZero'),
            ),
          ),
          h(
            'div',
            { className: 'dswsb-list' },
            loadError ? h('p', { className: 'dswsb-note dswsb-note--error' }, t('failedLoadDetail', { message: loadError })) : null,
            loading && items.length === 0 ? h('p', { className: 'dswsb-note' }, t('loading')) : null,
            !loading && items.length === 0 ? h('p', { className: 'dswsb-note' }, t('empty')) : null,
            !loading && items.length > 0 && visible.length === 0
              ? h('p', { className: 'dswsb-note' }, t('noMatch'))
              : null,
            visible.map((workspace) =>
              h(WorkspaceRow, {
                key: workspace.workspaceId,
                workspace,
                checked: selected.has(workspace.workspaceId),
                status: statusById[workspace.workspaceId],
                disabled: busy,
                onToggle: toggle,
                counts: counts.get(workspace.workspaceId) || { visible: 0, archived: 0 },
                t,
              }),
            ),
            phase === 'confirm'
              ? h('p', { className: 'dswsb-note dswsb-note--warn' }, t('confirmHint'))
              : null,
            phase === 'done' && failures.length > 0
              ? h(
                  'ul',
                  { className: 'dswsb-errors' },
                  failures.map((failure) =>
                    h('li', { key: failure.id }, failure.message),
                  ),
                )
              : null,
          ),
          h('div', { className: 'dswsb-foot2' }, footer),
        ),
      );
    }

    /* ----------------------------------------------------------------- styles */

    const CSS = `
.dswsb-foot{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 8px;box-sizing:border-box;
  border:1px solid transparent;border-radius:var(--dsw-radius-sm,6px);background:transparent;
  color:var(--dsw-alias-label-secondary,inherit);font-family:inherit;font-size:12px;line-height:18px;
  cursor:pointer;white-space:nowrap}
.dswsb-foot:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));color:var(--dsw-alias-label-primary,inherit)}
.dswsb-foot[aria-pressed="true"]{background:var(--dsw-alias-interactive-bg-active,rgba(0,0,0,.08));color:var(--dsw-alias-label-primary,inherit)}

/* 标题行图标按钮：尺寸/圆角/颜色对齐同排的 Search / View options / Add workspace（28×28, 8px） */
.dswsb-iconbtn{display:flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;
  box-sizing:border-box;border:1px solid transparent;border-radius:8px;background:transparent;
  color:var(--dsw-alias-label-secondary,#61666b);cursor:pointer}
.dswsb-iconbtn svg{width:16px;height:16px}
.dswsb-iconbtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));color:var(--dsw-alias-label-primary,inherit)}
.dswsb-iconbtn[aria-pressed="true"]{background:var(--dsw-alias-interactive-bg-active,rgba(0,0,0,.08));color:var(--dsw-alias-label-primary,inherit)}
/* portal 只能追加，用 flex order 把它排到标题行最左侧（标签之前） */
.dswsb-iconbtn--lead{order:-1}

.dswsb-layer{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;
  background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.45));pointer-events:auto}
.dswsb-panel{box-sizing:border-box;display:flex;flex-direction:column;width:min(720px,calc(100% - 64px));
  max-height:min(76vh,760px);overflow:hidden;outline:none;
  border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));border-radius:var(--dsw-radius-lg,12px);
  background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2329);
  box-shadow:var(--dsw-shadow-lv3,0 12px 32px rgba(0,0,0,.18));font-family:var(--dsw-font-family,inherit);font-size:13px}

.dswsb-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px 8px}
.dswsb-title{font-size:15px;font-weight:600;line-height:22px}
.dswsb-close{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;
  border:1px solid transparent;border-radius:var(--dsw-radius-sm,6px);background:transparent;
  color:var(--dsw-alias-label-tertiary,#8a8f98);cursor:pointer}
.dswsb-close:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));color:var(--dsw-alias-label-primary,inherit)}
.dswsb-close:disabled{opacity:.4;cursor:not-allowed}

.dswsb-desc{margin:0;padding:0 20px 12px;color:var(--dsw-alias-label-tertiary,#8a8f98);font-size:12px;line-height:18px}
.dswsb-toolbar{display:flex;align-items:center;gap:8px;padding:0 20px 12px}
.dswsb-input{flex:1;height:30px;padding:0 10px;box-sizing:border-box;font-family:inherit;font-size:13px;
  color:var(--dsw-alias-label-primary,inherit);background:var(--dsw-alias-bg-base,transparent);
  border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));border-radius:var(--dsw-radius-sm,6px);outline:none}
.dswsb-input:focus{border-color:var(--dsw-alias-brand-primary,#4d6bfe)}
.dswsb-input:disabled{opacity:.6}

.dswsb-list{flex:1;min-height:140px;overflow:auto;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08))}
.dswsb-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;column-gap:10px;
  padding:9px 20px;cursor:pointer;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06))}
.dswsb-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04))}
.dswsb-row--checked{background:var(--dsw-alias-interactive-bg-active,rgba(0,0,0,.06))}
.dswsb-row--failed{box-shadow:inset 2px 0 0 var(--dsw-alias-state-error-primary,#e5484d)}
.dswsb-check{margin:0;width:14px;height:14px;accent-color:var(--dsw-alias-brand-primary,#4d6bfe);cursor:inherit}
.dswsb-rowMain{display:flex;flex-direction:column;gap:2px;min-width:0}
.dswsb-rowTitle{font-size:13px;line-height:18px;color:var(--dsw-alias-label-primary,inherit);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dswsb-rowPath{font-size:12px;line-height:16px;color:var(--dsw-alias-label-tertiary,#8a8f98);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dswsb-rowMeta{display:flex;align-items:center;gap:8px;flex:none}
.dswsb-pill{font-size:11px;line-height:16px;padding:0 6px;border-radius:999px;
  color:var(--dsw-alias-label-secondary,#5f6672);background:var(--dsw-alias-bg-layer-3,rgba(0,0,0,.05))}
.dswsb-pill--error{color:var(--dsw-alias-state-error-primary,#e5484d)}
.dswsb-time{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#8a8f98);white-space:nowrap}

.dswsb-note{margin:0;padding:14px 20px;color:var(--dsw-alias-label-tertiary,#8a8f98);font-size:12px;line-height:18px}
.dswsb-note--error{color:var(--dsw-alias-label-error,#e5484d)}
.dswsb-note--warn{color:var(--dsw-alias-state-warn-primary,#c27c0e)}
.dswsb-errors{margin:0;padding:0 20px 14px 36px;color:var(--dsw-alias-label-error,#e5484d);font-size:12px;line-height:18px}

.dswsb-foot2{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:12px 20px;
  border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08))}
.dswsb-count{margin-right:auto;color:var(--dsw-alias-label-secondary,#5f6672);font-size:12px;line-height:18px}
.dswsb-count--warn{color:var(--dsw-alias-state-warn-primary,#c27c0e)}
.dswsb-count--error{color:var(--dsw-alias-label-error,#e5484d)}
.dswsb-btn{height:30px;padding:0 12px;box-sizing:border-box;font-family:inherit;font-size:13px;line-height:18px;
  color:var(--dsw-alias-label-primary,inherit);background:transparent;
  border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));border-radius:var(--dsw-radius-sm,6px);cursor:pointer;white-space:nowrap}
.dswsb-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04))}
.dswsb-btn:disabled{opacity:.45;cursor:not-allowed}
.dswsb-btn--sm{height:28px;font-size:12px}
.dswsb-btn--danger{color:var(--dsw-alias-state-error-primary,#e5484d);border-color:var(--dsw-alias-state-error-primary,#e5484d)}
.dswsb-btn--danger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger,rgba(229,72,77,.1))}
`;

    /* ------------------------------------------------------------------ plugin */

    function apply(ctx) {
      // 样式表挂在插件自身的 effect 上，卸载即摘除。
      ctx.effect(() => {
        const style = document.createElement('style');
        style.dataset.dshPlugin = 'dsh-workspace-batch';
        style.textContent = CSS;
        document.head.appendChild(style);
        return () => {
          style.remove();
        };
      });

      // 字典注册在插件自身的 effect 上：卸载即摘掉。注册过的语言由 locale 服务
      // 按当前偏好挑选，缺键时回落到 en。
      for (const locale of Object.keys(DICTS)) {
        ctx.effect(() => ctx.locale.register(NS, locale, DICTS[locale]));
      }

      // 槽位的 `locale: NS` 座位会带来绑定到本命名空间的 `t`；万一某个宿主没提供
      // 座位（自定义 shell / 极简组合），用 bind 出来的等价函数兜底。
      const boundT = ctx.locale.bind(NS);
      const seat = (props) => ({ ...props, t: typeof props.t === 'function' ? props.t : boundT });

      const openFlag = createFlag(false);
      const service = ctx.workspaces;

      // 注册在底部动作槽里，只是拿一个「活着的位置」——真正渲染的位置由
      // HeaderEntry 决定：标题行找得到就 portal 过去（不在底部留下空位），
      // 找不到才回退成底部那一行。
      ctx.slots.inject('sidebar.footer.action', () =>
        ctx.slots.register(
          { name: 'sidebar.footer.action', id: 'workspace-batch', order: 900, locale: NS },
          function WorkspaceBatchEntry(props) {
            return h(HeaderEntry, { ...seat(props), openFlag });
          },
        ),
      );

      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register(
          { name: 'shell.overlay', id: 'workspace-batch', order: 900, locale: NS },
          function WorkspaceBatchOverlay(props) {
            return h(BatchDialog, { ...seat(props), openFlag, service });
          },
        ),
      );
    }

    return {
      inject: ['slots', 'workspaces', 'locale'],
      apply,
    };
  },
});
