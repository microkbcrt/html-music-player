const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const jsmediatags = require('jsmediatags'); // 在主进程引入，绝对安全

let mainWindow;
const AUDIO_EXTS = ['.mp3', '.flac', '.wav', '.ogg', '.m4a'];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: true,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      sandbox: false 
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  // 窗口加载完成后，处理启动文件
  mainWindow.webContents.on('did-finish-load', () => {
    handleStartup();
  });
}

function handleStartup() {
  // 获取启动参数（兼容 Windows 双击文件启动）
  let filePath = null;
  if (process.platform === 'win32' && process.argv.length >= 2) {
    const lastArg = process.argv[process.argv.length - 1];
    if (fs.existsSync(lastArg) && fs.statSync(lastArg).isFile() && lastArg !== process.execPath) {
      if (AUDIO_EXTS.includes(path.extname(lastArg).toLowerCase())) {
        filePath = lastArg;
      }
    }
  }

  // 如果没有双击文件，就默认扫描一下 Music 文件夹，或者留空等待拖拽（这里演示留空）
  if (filePath) {
    loadDirectoryAndPlay(filePath);
  }
}

function loadDirectoryAndPlay(targetFile) {
  const dir = path.dirname(targetFile);
  try {
    const files = fs.readdirSync(dir);
    // 生成播放列表
    const playlist = files
      .filter(file => AUDIO_EXTS.includes(path.extname(file).toLowerCase()))
      .map(file => path.join(dir, file));

    const currentIndex = playlist.indexOf(targetFile);

    // 发送给前端
    mainWindow.webContents.send('app-init-playlist', {
      playlist,
      currentIndex: currentIndex === -1 ? 0 : currentIndex
    });
  } catch (err) {
    console.error('Dir read error', err);
  }
}

// --- IPC 接口 ---

// 1. 读取基础文件信息（音频流地址 + 歌词文本）
ipcMain.handle('read-file-data', async (event, filePath) => {
  try {
    const pathObj = path.parse(filePath);
    // 尝试寻找同名 lrc
    const lrcPath = path.join(pathObj.dir, pathObj.name + '.lrc');
    let lrcContent = null;
    if (fs.existsSync(lrcPath)) {
      lrcContent = fs.readFileSync(lrcPath, 'utf-8');
    }

    return {
      // 转化为 file:/// 协议，供 Audio 标签播放
      src: `file://${filePath.replace(/\\/g, '/')}`,
      lrc: lrcContent,
      filename: pathObj.base,
      basename: pathObj.name
    };
  } catch (error) {
    return null;
  }
});

// 2. 读取元数据 (Title, Artist, Cover) - 核心修复点
ipcMain.handle('read-music-tags', async (event, filePath) => {
  return new Promise((resolve) => {
    new jsmediatags.Reader(filePath)
      .setTagsToRead(["title", "artist", "album", "picture"])
      .read({
        onSuccess: (tag) => resolve(tag),
        onError: (error) => {
          console.log('Read tags failed:', error.type);
          resolve({ tags: {} }); // 失败返回空，保证前端不崩
        }
      });
  });
});

// 单例锁
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      const lastArg = commandLine[commandLine.length - 1];
      if (fs.existsSync(lastArg) && fs.statSync(lastArg).isFile()) {
        loadDirectoryAndPlay(lastArg);
      }
    }
  });
  app.whenReady().then(createWindow);
}
