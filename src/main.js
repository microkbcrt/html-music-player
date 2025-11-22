const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const jsmediatags = require('jsmediatags');

let mainWindow;

// 支持的音频扩展名
const AUDIO_EXTS = ['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac'];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: true, // 系统原生标题栏
    titleBarStyle: 'default', 
    backgroundColor: '#000000',
    icon: path.join(__dirname, '../resources/icon.ico'), // 确保图标路径存在，或者删除此行
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // 开启上下文隔离，更安全
      nodeIntegration: false, // 禁用渲染进程直接使用 Node
      sandbox: false,         // 关闭沙盒，确保主进程文件操作顺畅
      webSecurity: false      // 允许加载本地 file:// 资源 (音频/图片)
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // 窗口加载完成后，检查是否有启动参数（双击文件打开的情况）
  mainWindow.webContents.on('did-finish-load', () => {
    handleStartupEvent();
  });
}

// --- 启动与文件处理逻辑 ---

// 获取播放列表：扫描目标文件所在目录的所有音频
function generatePlaylist(targetPath) {
  try {
    const dir = path.dirname(targetPath);
    const files = fs.readdirSync(dir);
    
    // 过滤音频文件并获取绝对路径
    const playlist = files
      .filter(file => AUDIO_EXTS.includes(path.extname(file).toLowerCase()))
      .map(file => path.join(dir, file));

    // 找到当前文件的索引
    const startIndex = playlist.indexOf(targetPath);

    return {
      playlist,
      startIndex: startIndex === -1 ? 0 : startIndex
    };
  } catch (error) {
    console.error("Scanning directory failed:", error);
    return { playlist: [], startIndex: 0 };
  }
}

// 处理启动参数
function handleStartupEvent() {
  let filePath = null;

  // Windows: process.argv 通常包含执行路径和文件路径
  // 开发环境下 argv 可能是 [electron.exe, ., file]
  // 生产环境下 argv 可能是 [app.exe, file]
  if (process.platform === 'win32' && process.argv.length >= 2) {
    const lastArg = process.argv[process.argv.length - 1];
    if (fs.existsSync(lastArg) && fs.statSync(lastArg).isFile()) {
      const ext = path.extname(lastArg).toLowerCase();
      if (AUDIO_EXTS.includes(ext)) {
        filePath = lastArg;
      }
    }
  }

  // macOS 的 open-file 事件会在 app 启动前或运行时触发，那里会处理 filePath
  // 如果这里检测到了 filePath (主要是 Windows)，直接发送
  if (filePath) {
    const data = generatePlaylist(filePath);
    mainWindow.webContents.send('playlist-updated', data);
  }
}

// --- IPC 通信 (响应前端请求) ---

// 1. 读取具体音轨信息 (音频路径 + 歌词)
ipcMain.handle('load-track', async (event, filePath) => {
  try {
    // 构建 file URL 供 Audio 标签使用
    // Windows 下路径的反斜杠需要转义
    const audioSrc = `file://${filePath.replace(/\\/g, '/')}`;
    
    // 尝试读取同名歌词文件
    const pathObj = path.parse(filePath);
    const lrcPath = path.join(pathObj.dir, pathObj.name + '.lrc');
    let lrcContent = null;

    if (fs.existsSync(lrcPath)) {
      lrcContent = fs.readFileSync(lrcPath, 'utf-8');
    } else {
        // 尝试找 .txt 后缀的歌词
        const txtPath = path.join(pathObj.dir, pathObj.name + '.txt');
        if (fs.existsSync(txtPath)) lrcContent = fs.readFileSync(txtPath, 'utf-8');
    }

    return {
      audioSrc,
      lrcContent,
      filename: pathObj.name
    };
  } catch (error) {
    console.error('Track load error:', error);
    return null;
  }
});

// 2. 读取 ID3 标签 (封面、歌手、标题)
// 这是一个耗时操作，所以通过 IPC 在主进程完成，避免阻塞 UI
ipcMain.handle('read-tags', async (event, filePath) => {
  return new Promise((resolve) => {
    new jsmediatags.Reader(filePath)
      .setTagsToRead(["title", "artist", "album", "picture"])
      .read({
        onSuccess: (tag) => {
          resolve(tag);
        },
        onError: (error) => {
          console.warn('Read tags error:', error.type, error.info);
          // 即使失败也返回空对象，防止前端崩溃
          resolve({ tags: {} });
        }
      });
  });
});

// 3. 窗口控制
ipcMain.on('window-min', () => mainWindow.minimize());
ipcMain.on('window-close', () => mainWindow.close());

// --- 应用生命周期 ---

// 核心：单例锁。防止双击新文件时打开第二个播放器窗口
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  // 当第二个实例启动时触发（例如用户双击了另一个 MP3）
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();

      // 解析新实例传递过来的文件路径 (Windows)
      const lastArg = commandLine[commandLine.length - 1];
      if (fs.existsSync(lastArg) && fs.statSync(lastArg).isFile()) {
        const ext = path.extname(lastArg).toLowerCase();
        if (AUDIO_EXTS.includes(ext)) {
          const data = generatePlaylist(lastArg);
          mainWindow.webContents.send('playlist-updated', data);
        }
      }
    }
  });

  // macOS: 监听文件打开事件
  app.on('open-file', (event, pathStr) => {
    event.preventDefault();
    if (mainWindow) {
      const data = generatePlaylist(pathStr);
      mainWindow.webContents.send('playlist-updated', data);
    } else {
      // 如果窗口还没创建（冷启动），这里很难直接发给 webContents
      // 通常需要存个全局变量，等 createWindow 完成后再发，或者利用 argv 逻辑
      // 简单起见，macOS 下我们让用户拖拽，或者依赖 create window 后的逻辑
    }
  });

  app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
