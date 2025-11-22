const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
// 1. 在这里引入 jsmediatags
const jsmediatags = require('jsmediatags');

let mainWindow;

const AUDIO_EXTS = ['.mp3', '.flac', '.wav', '.ogg', '.m4a'];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
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
      sandbox: false // 2. 建议显式关闭沙盒，以防某些文件系统操作受限
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  mainWindow.webContents.on('did-finish-load', () => {
    handleStartupFile();
  });
}

function handleStartupFile() {
  let filePath = null;
  if (process.platform === 'win32' && process.argv.length >= 2) {
    const lastArg = process.argv[process.argv.length - 1];
    // 简单的判断，防止开发环境读取到 .exe 自身
    if (fs.existsSync(lastArg) && fs.statSync(lastArg).isFile() && lastArg !== process.execPath) {
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

function loadDirectoryAndPlay(targetFile) {
  const dir = path.dirname(targetFile);
  try {
    const files = fs.readdirSync(dir);
    const playlist = files
      .filter(file => AUDIO_EXTS.includes(path.extname(file).toLowerCase()))
      .map(file => path.join(dir, file));

    const currentIndex = playlist.indexOf(targetFile);

    mainWindow.webContents.send('app-init-playlist', {
      playlist,
      currentIndex: currentIndex === -1 ? 0 : currentIndex
    });
  } catch (err) {
    console.error('Error reading directory:', err);
  }
}

// --- IPC 处理 ---

ipcMain.handle('read-file-data', async (event, filePath) => {
  try {
    const pathObj = path.parse(filePath);
    const lrcPath = path.join(pathObj.dir, pathObj.name + '.lrc');
    let lrcContent = null;
    
    if (fs.existsSync(lrcPath)) {
      lrcContent = fs.readFileSync(lrcPath, 'utf-8');
    }

    return {
      src: `file://${filePath.replace(/\\/g, '/')}`,
      lrc: lrcContent,
      filename: pathObj.base
    };
  } catch (error) {
    console.error('File read error:', error);
    return null;
  }
});

// 3. 新增：在主进程处理 Tags 读取
ipcMain.handle('read-music-tags', async (event, filePath) => {
  return new Promise((resolve, reject) => {
    new jsmediatags.Reader(filePath)
      .setTagsToRead(["title", "artist", "album", "picture"])
      .read({
        onSuccess: (tag) => {
          resolve(tag);
        },
        onError: (error) => {
          console.log('Tags read error:', error);
          resolve({ tags: {} }); // 失败也返回空对象，防止前端报错
        }
      });
  });
});


const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      
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
