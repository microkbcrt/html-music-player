const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    // 1. 监听播放列表更新（启动时或拖入文件时触发）
    onPlaylistUpdate: (callback) => {
        ipcRenderer.on('playlist-updated', (event, data) => callback(data));
    },

    // 2. 读取音频文件和歌词内容
    // 返回格式: { audioSrc: "file://...", lrcContent: "string" }
    loadTrack: (filePath) => ipcRenderer.invoke('load-track', filePath),

    // 3. 读取元数据 (Title, Artist, Cover)
    // 我们将 jsmediatags 的逻辑移到主进程，前端直接拿结果
    readTags: (filePath) => ipcRenderer.invoke('read-tags', filePath),

    // 4. 窗口控制 (可选，如果你想做无边框窗口)
    minimize: () => ipcRenderer.send('window-min'),
    close: () => ipcRenderer.send('window-close')
});
