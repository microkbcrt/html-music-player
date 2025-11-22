const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

// 支持的音频格式
const AUDIO_EXTS = ['.mp3', '.flac', '.wav', '.ogg', '.m4a'];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: true, // 系统原生标题栏，设为 false 可自定义
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true 
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  // 窗口加载完毕后，处理启动文件
  mainWindow.webContents.on('did-finish-load', () => {
    handleStartupFile();
  });
}

// 处理启动参数（核心：双击打开文件）
function handleStartupFile() {
  let filePath = null;

  // Windows: process.argv[1] 通常是文件路径 (开发模式下可能是 process.argv[2])
  if (process.platform === 'win32' && process.argv.length >= 2) {
    const lastArg = process.argv[process.argv.length - 1];
    if (fs.existsSync(lastArg) && fs.statSync(lastArg).isFile()) {
      const ext = path.extname(lastArg).toLowerCase();
      if (AUDIO_EXTS.includes(ext)) {
        filePath = lastArg;
      }
    }
  }

  if (filePath) {
    loadDirectoryAndPlay(filePath);
  }
}

// 扫描目录并发送给前端
function loadDirectoryAndPlay(targetFile) {
  const dir = path.dirname(targetFile);
  
  try {
    // 读取目录所有文件
    const files = fs.readdirSync(dir);
    
    // 过滤音频文件并构建播放列表
    const playlist = files
      .filter(file => AUDIO_EXTS.includes(path.extname(file).toLowerCase()))
      .map(file => path.join(dir, file));

    const currentIndex = playlist.indexOf(targetFile);

    // 发送数据到渲染进程
    mainWindow.webContents.send('app-init-playlist', {
      playlist,
      currentIndex: currentIndex === -1 ? 0 : currentIndex
    });

  } catch (err) {
    console.error('Error reading directory:', err);
  }
}

// IPC 监听：前端请求读取具体文件数据（音频url + 歌词）
ipcMain.handle('read-file-data', async (event, filePath) => {
  try {
    // 1. 读取歌词
    const pathObj = path.parse(filePath);
    const lrcPath = path.join(pathObj.dir, pathObj.name + '.lrc');
    let lrcContent = null;
    
    if (fs.existsSync(lrcPath)) {
      lrcContent = fs.readFileSync(lrcPath, 'utf-8');
    }

    // 2. 返回文件协议路径供前端 Audio 标签使用
    // Electron 自动处理 file:// 协议的资源访问
    return {
      src: `file://${filePath.replace(/\\/g, '/')}`, // 转换为 file URL
      lrc: lrcContent,
      filename: pathObj.base
    };
  } catch (error) {
    console.error('File read error:', error);
    return null;
  }
});

// 监听单例模式（防止双击新文件打开新窗口，而是复用当前窗口）
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      
      // 解析新打开的文件
      const lastArg = commandLine[commandLine.length - 1];
      if (fs.existsSync(lastArg) && fs.statSync(lastArg).isFile()) {
        const ext = path.extname(lastArg).toLowerCase();
        if (AUDIO_EXTS.includes(ext)) {
          loadDirectoryAndPlay(lastArg);
        }
      }
    }
  });

  app.whenReady().then(createWindow);
  
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
