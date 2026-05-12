import { app, BrowserWindow, shell, Menu, MenuItemConstructorOptions } from 'electron';
import path from 'node:path';

const REMOTE_URL = 'https://kb.liii.in';

declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// Windows 安装时 squirrel 会拉起一次进程做 shortcut 处理,直接退出。
if (require('electron-squirrel-startup')) {
  app.quit();
}

const buildMenu = (window: BrowserWindow): Menu => {
  const goto = (urlPath: string) => () => {
    window.loadURL(REMOTE_URL + urlPath);
  };

  const navSubmenu: MenuItemConstructorOptions[] = [
    { label: '知识库后台(首页)', accelerator: 'CmdOrCtrl+1', click: goto('/') },
    { label: '工作台 Console', accelerator: 'CmdOrCtrl+2', click: goto('/console') },
    { type: 'separator' },
    { label: 'API 文档', click: goto('/api') },
    { label: '设计系统', click: goto('/ds') },
    { label: '帮助', click: goto('/help') },
    {
      label: 'Demo',
      submenu: [
        { label: 'Demo 首页', click: goto('/demo') },
        { label: 'Insight Demo', click: goto('/demo/insight') },
        { label: 'Survey Demo', click: goto('/demo/survey') },
        { label: 'Outline Demo', click: goto('/demo/outline') },
      ],
    },
    { type: 'separator' },
    { label: '课程', click: goto('/course/') },
    { label: '估算工具', click: goto('/estimate/') },
    { type: 'separator' },
    {
      label: '后退',
      accelerator: 'CmdOrCtrl+[',
      click: () => {
        const h = window.webContents.navigationHistory;
        if (h.canGoBack()) h.goBack();
      },
    },
    {
      label: '前进',
      accelerator: 'CmdOrCtrl+]',
      click: () => {
        const h = window.webContents.navigationHistory;
        if (h.canGoForward()) h.goForward();
      },
    },
  ];

  const isMac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ] as MenuItemConstructorOptions[])
      : []),
    {
      label: '文件',
      submenu: [
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu', label: '编辑' },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '刷新' },
        { role: 'forceReload', label: '强制刷新' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    { label: '导航', submenu: navSubmenu },
    { role: 'windowMenu', label: '窗口' },
  ];

  return Menu.buildFromTemplate(template);
};

const createWindow = (): void => {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: '纷享 KB',
    icon: path.join(__dirname, '..', '..', 'icons', 'icon.png'),
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(REMOTE_URL);

  // 站内导航留在窗口里;target=_blank 等新窗口请求:
  //   同 host(kb.liii.in)的当前窗口跳转;不同 host 走系统浏览器。
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url);
      const current = new URL(REMOTE_URL);
      if (target.host !== current.host) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
      mainWindow.loadURL(url);
      return { action: 'deny' };
    } catch {
      return { action: 'deny' };
    }
  });

  Menu.setApplicationMenu(buildMenu(mainWindow));
};

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
