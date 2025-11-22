const { contextBridge, ipcRenderer } = require('electron');
const jsmediatags = require('jsmediatags');

contextBridge.exposeInMainWorld('electronAPI', {
  // 监听主进程发来的播放列表
  onInitPlaylist: (callback) => ipcRenderer.on('app-init-playlist', callback),
  
  // 请求读取文件详细数据
  readFileData: (filePath) => ipcRenderer.invoke('read-file-data', filePath),
  
  // 暴露 jsmediatags 给前端使用 (因为它是纯JS库，可以在浏览器环境跑，但这里我们需要读取本地文件Buffer)
  // 这里的技巧是：让前端传 file path 进来，我们在 Node 环境读取 tags
  readTags: (filePath) => {
    return new Promise((resolve, reject) => {
      new jsmediatags.Reader(filePath)
        .setTagsToRead(["title", "artist", "album", "picture"])
        .read({
          onSuccess: (tag) => resolve(tag),
          onError: (error) => reject(error)
        });
    });
  }
});
