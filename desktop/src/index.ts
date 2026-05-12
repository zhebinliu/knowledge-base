import { app, BrowserWindow, shell, Menu } from 'electron';
import path from 'node:path';

const REMOTE_URL = 'https://kb.liii.in';

declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// Windows 安装时 squirrel 会拉起一次进程做 shortcut 处理,直接退出。
if (require('electron-squirrel-startup')) {
  app.quit();
}

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

  // 站内导航留在窗口里,外链(http/https 且不同 host)走系统浏览器。
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url);
      const current = new URL(REMOTE_URL);
      if (target.host !== current.host) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
    } catch {
      // URL 解析失败的直接拦掉
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
};

app.on('ready', () => {
  // macOS 用默认菜单(含拷贝粘贴等系统快捷键);其他平台隐藏菜单栏。
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
  }
  createWindow();
});

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
