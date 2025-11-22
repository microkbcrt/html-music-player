const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 监听播放列表初始化
  onInitPlaylist: (callback) => ipcRenderer.on('app-init-playlist', callback),
  
  // 读取文件内容 (Audio Src, Lyric Text)
  readFileData: (filePath) => ipcRenderer.invoke('read-file-data', filePath),
  
  // 读取 ID3 Tags (通过主进程调用 jsmediatags)
  readTags: (filePath) => ipcRenderer.invoke('read-music-tags', filePath)
});
