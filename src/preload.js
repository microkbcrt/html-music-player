const { contextBridge, ipcRenderer } = require('electron');

// 注意：Preload 脚本中不要 require 'jsmediatags'
// 我们通过 ipcRenderer.invoke 让主进程去干脏活累活

contextBridge.exposeInMainWorld('electronAPI', {
  // 监听主进程发来的播放列表
  onInitPlaylist: (callback) => ipcRenderer.on('app-init-playlist', callback),
  
  // 请求读取文件基础数据 (URL, 歌词)
  readFileData: (filePath) => ipcRenderer.invoke('read-file-data', filePath),
  
  // 请求读取音乐 Tags (现在改为调用主进程)
  readTags: (filePath) => ipcRenderer.invoke('read-music-tags', filePath)
});
