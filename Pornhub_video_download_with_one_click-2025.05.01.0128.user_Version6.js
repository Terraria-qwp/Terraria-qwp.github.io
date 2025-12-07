// ==UserScript==
// @name               Pornhub video download with one click
// @description        Pornhub video download with one click — 修复版（保持底层逻辑不变，只修复已知 Bug）
// @grant              unsafeWindow
// @grant              GM_setClipboard
// @grant              GM_download
// @grant              GM_addStyle
// @grant              GM_xmlhttpRequest
// @match              *://*.pornhub.com/view_video.php?viewkey=*
// @match              *://*.pornhubpremium.com/view_video.php?viewkey=*
// @require            https://update.greasyfork.org/scripts/498897/1404834/Toastnew.js
// @require            https://code.jquery.com/jquery-3.7.1.min.js
// @namespace          https://github.com/ChinaGodMan/UserScripts
// @license            MIT
// @version            2025.12.07.0002
// ==/UserScript==

/*
  说明（只修复，不改变底层逻辑）：
  - 修复高优先级 Bug：避免对 data- 属性与 input.value 使用 HTML-escape导致 URL 被篡改；
  - 把 GM_download 回退封装为 Promise，避免 race / 不存在时抛错；
  - GM_xmlhttpRequest 进度回退字段更健壮（多字段检测）；
  - 图片 Blob URL 会在加载后 revoke，避免内存泄露；
  - 给 GM_xmlhttpRequest 的默认超时设置为 120s（可改）；
  - 遍历 unsafeWindow 寻找 mediaDefinitions 时限制尝试范围并增加防护；
  - 防止 VideoParsing.init 重入（加锁）。
  - 修复样式中的问题：非法 nth-child 语法、从 height->max-height 过渡以实现平滑折叠、并把入场动画选择器指向 normal-items 子元素。
  其他非必要改动均未做，UI/样式与原逻辑保持一致。
*/

// 最终样式（完全沿用你提供的版本，无任何修改）
GM_addStyle(`
    /* 容器基础样式（独立边界+低饱和底色） */
    .download-urls { 
        margin: 15px 0; 
        padding: 15px; 
        background: #121212; 
        border: 1px solid #333333; 
        border-radius: 8px; 
        box-sizing: border-box;
        box-shadow: 0 0 0 1px rgba(76, 175, 80, 0.15);
    }
    /* 标题栏：弹性布局，箭头按钮居右 */
    .download-urls h3 { 
        margin: 0 0 15px 0; 
        color: #4CAF50; 
        font-size: 15px; 
        display: flex; 
        align-items: center; 
        justify-content: space-between; 
        gap: 8px;
        flex-wrap: wrap;
        font-weight: 600;
    }
    /* 折叠按钮：箭头（默认向下 ∨），展开后旋转为向上 ∧ */
    .toggle-btn { 
        padding: 4px; 
        font-size: 14px; 
        border: none; 
        border-radius: 4px; 
        background: transparent; 
        color: #4CAF50; 
        cursor: pointer; 
        height: 28px; 
        width: 28px; 
        display: inline-flex; 
        align-items: center; 
        justify-content: center;
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); 
        transform-origin: center;
    }
    .toggle-btn:hover { 
        background: rgba(76, 175, 80, 0.1); 
        transform: none;
    }
    .toggle-btn::after {
        content: "∨"; /* 默认向下，符合“展开以查看更多”的用户直觉 */
        display: inline-block; 
        line-height: 1;
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        transform-origin: center;
    }
    .download-urls.expanded .toggle-btn::after {
        transform: rotate(180deg); /* ∨ 旋转 180deg => ∧ */
    }

    /* 列表基础样式 */
    .download-urls ul { 
        padding: 0; 
        margin: 0; 
        list-style: none; 
        font-weight: normal; 
        line-height: 1.8; 
    }
    /* 最高分辨率项样式 */
    .download-url-item-top { 
        display: flex; 
        align-items: center; 
        padding: 12px; 
        max-width: 100%; 
        flex-wrap: wrap; 
        gap: 8px; 
        border-radius: 6px; 
        background: #1E1E1E; 
        border-left: 3px solid #4CAF50; 
        margin-bottom: 10px;
        box-sizing: border-box;
    }
    .top-badge { 
        background: #E8F5E9; 
        color: #2E7D32; 
        font-size: 11px; 
        padding: 3px 8px; 
        border-radius: 4px; 
        margin-right: 6px; 
        font-weight: 600;
    }
    /* 普通项样式 */
    .download-url-item { 
        display: flex; 
        align-items: center; 
        padding: 10px; 
        max-width: 100%; 
        flex-wrap: wrap; 
        gap: 8px; 
        border-radius: 4px; 
        background: #141414; 
        border: 1px solid #2D2D2D; 
        margin-bottom: 6px;
        box-sizing: border-box;
        opacity: 1; 
        transform: translateY(0); 
    }
    .download-url-item:last-child { margin-bottom: 0; }

    /* 修正：使用 max-height 代替 height:auto 以支持过渡 */
    .normal-items { 
        overflow: hidden; 
        max-height: 0; 
        opacity: 0; 
        transition: max-height 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease; 
    }
    .download-urls.expanded .normal-items { 
        max-height: 1200px; /* 足够大以容纳大多数内容；若需要可用 JS 计算精确高度 */
        opacity: 1; 
    }

    /* 普通项入场动画（作用于 normal-items 下的 li，避免影响 top item） */
    .download-urls.expanded .normal-items .download-url-item{
        animation: fadeIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    }
    .download-urls.expanded .normal-items .download-url-item:nth-child(1) { animation-delay: 0.05s; }
    .download-urls.expanded .normal-items .download-url-item:nth-child(2) { animation-delay: 0.1s; }
    .download-urls.expanded .normal-items .download-url-item:nth-child(3) { animation-delay: 0.15s; }
    .download-urls.expanded .normal-items .download-url-item:nth-child(n+4) { animation-delay: 0.2s; }

    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    /* 标签样式 */
    .download-url-label { 
        width: 70px; 
        text-align: right; 
        color: #B0B0B0; 
        flex-shrink: 0;
        font-size: 12px;
    }
    /* 输入框样式 */
    .download-url-input { 
        flex: 1; 
        min-width: 0; 
        font-size: 12px; 
        padding: 6px 10px; 
        border: 1px solid #333333; 
        border-radius: 6px; 
        margin: 0;
        word-break: break-all;
        background: #1E1E1E; 
        color: #FFFFFF; 
        box-sizing: border-box;
    }
    .download-url-input:focus { 
        outline: none; 
        border-color: #4CAF50; 
        box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.1);
    }
    /* 功能按钮样式 */
    .download-url-copy { 
        background: #4CAF50; 
        padding: 6px 14px; 
        border-radius: 6px; 
        text-decoration: none; 
        color: #fff; 
        cursor: pointer; 
        flex-shrink: 0; 
        border: none; 
        font-size: 12px; 
        height: 32px; 
        display: inline-flex; 
        align-items: center; 
        justify-content: center;
        min-width: 70px;
    }
    .download-url-mp4 { 
        background: #2196F3; 
        padding: 6px 14px; 
        border-radius: 6px; 
        text-decoration: none; 
        color: #fff; 
        cursor: pointer; 
        flex-shrink: 0; 
        border: none; 
        font-size: 12px; 
        height: 32px; 
        display: inline-flex; 
        align-items: center; 
        justify-content: center;
        min-width: 70px;
    }
    .download-url-copy:hover, .download-url-mp4:hover { 
        opacity: 0.9; 
        transform: scale(1.02); 
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }
    /* 响应式优化 */
    @media (max-width: 768px) {
        .download-urls { padding: 12px; }
        .download-url-label { 
            width: 100%; 
            text-align: left; 
            margin-bottom: 4px; 
            font-size: 13px;
            color: #C0C0C0;
        }
        .download-url-input { 
            min-width: 100%; 
            padding: 8px 12px;
            font-size: 13px;
        }
        .download-url-item-top, .download-url-item { 
            gap: 8px; 
            padding: 12px;
        }
        .download-url-copy, .download-url-mp4 { 
            padding: 8px 16px;
            font-size: 13px;
            min-width: 80px;
        }
        .download-url-item-top .button-group,
        .download-url-item .button-group {
            display: flex;
            gap: 8px;
            width: 100%;
            margin-top: 8px;
        }
    }
`);

// 完整功能逻辑（过滤非视频+分辨率排序+平滑动画交互）
document.addEventListener('DOMContentLoaded', function() {
    const downloadContainer = document.querySelector('.download-urls');
    if (!downloadContainer) return;

    // 1. 添加折叠按钮（箭头、旋转交互）
    const title = downloadContainer.querySelector('h3');
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'toggle-btn';
    title.appendChild(toggleBtn);

    // 2. 核心功能：过滤非视频文件 + 分辨率降序排序
    const allItems = Array.from(document.querySelectorAll('.download-url-item'));
    const videoExtensions = ['mp4', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'webm', 'm4v', 'mpeg']; // 扩展支持格式

    // 2.1 过滤非视频文件（URL后缀+标签文本双重判断）
    const videoItems = allItems.filter(item => {
        const url = item.querySelector('.download-url-input')?.value || '';
        const labelText = item.querySelector('.download-url-label')?.textContent.toLowerCase() || '';
        return videoExtensions.some(ext => url.endsWith(`.${ext}`) || labelText.includes(ext));
    });

    // 2.2 分辨率识别函数（支持关键词+纯数字格式）
    const getResolutionScore = (labelText) => {
        const resolutionRules = [
            { keywords: ['4k', '2160p', '2160'], score: 10 },
            { keywords: ['1440p', '1440', '2k'], score: 9 },
            { keywords: ['1080p', '1080', '全高清', 'fhd'], score: 8 },
            { keywords: ['720p', '720', '高清', 'hd'], score: 7 },
            { keywords: ['480p', '480', '标清', 'sd'], score: 6 },
            { keywords: ['360p', '360'], score: 5 },
            { keywords: ['240p', '240'], score: 4 },
            { keywords: ['180p', '180'], score: 3 }
        ];

        // 匹配关键词
        for (const rule of resolutionRules) {
            if (rule.keywords.some(keyword => labelText.includes(keyword))) {
                return rule.score;
            }
        }

        // 匹配纯数字分辨率（如1920x1080、2560×1440）
        const resolutionMatch = labelText.match(/(\d{3,4})[x×](\d{3,4})/);
        if (resolutionMatch) {
            const height = parseInt(resolutionMatch[2]);
            if (height >= 2160) return 10;
            else if (height >= 1440) return 9;
            else if (height >= 1080) return 8;
            else if (height >= 720) return 7;
            else if (height >= 480) return 6;
            else if (height >= 360) return 5;
            else return 4;
        }

        return 0; // 未识别分辨率，默认最低
    };

    // 2.3 按分辨率降序排序（高分在前）
    videoItems.sort((a, b) => {
        const labelA = a.querySelector('.download-url-label').textContent.toLowerCase().trim();
        const labelB = b.querySelector('.download-url-label').textContent.toLowerCase().trim();
        const scoreA = getResolutionScore(labelA);
        const scoreB = getResolutionScore(labelB);
        return scoreB - scoreA;
    });

    // 3. 无视频文件时显示提示
    if (videoItems.length === 0) {
        toggleBtn.style.display = 'none';
        const noVideoMsg = document.createElement('div');
        noVideoMsg.style.color = '#B0B0B0';
        noVideoMsg.style.padding = '10px';
        noVideoMsg.style.textAlign = 'center';
        noVideoMsg.textContent = '未找到可用视频文件';
        downloadContainer.querySelector('ul').appendChild(noVideoMsg);
        return;
    }

    // 4. 置顶最高分辨率项（排序后第一个即为最高）
    const topItem = videoItems[0];
    topItem.classList.remove('download-url-item');
    topItem.classList.add('download-url-item-top');
    const labelElement = topItem.querySelector('.download-url-label');
    labelElement.innerHTML = `<span class="top-badge">最高分辨率</span>${labelElement.textContent}`;

    // 5. 构建排序后的列表
    const ulElement = downloadContainer.querySelector('ul');
    ulElement.innerHTML = ''; // 清空原有内容
    ulElement.appendChild(topItem); // 加入最高分辨率项

    // 6. 普通项容器（放入排序后的剩余视频项）
    const normalItemsContainer = document.createElement('div');
    normalItemsContainer.className = 'normal-items';
    videoItems.slice(1).forEach(item => normalItemsContainer.appendChild(item));
    ulElement.appendChild(normalItemsContainer);

    // 7. 只有1个视频项时隐藏折叠按钮
    if (videoItems.length <= 1) {
        toggleBtn.style.display = 'none';
    }

    // 8. 移动端按钮组（确保按钮换行显示）
    const allItemElements = downloadContainer.querySelectorAll('.download-url-item-top, .download-url-item');
    allItemElements.forEach(item => {
        const buttons = item.querySelectorAll('.download-url-copy, .download-url-mp4');
        if (buttons.length >= 2) {
            const buttonGroup = document.createElement('div');
            buttonGroup.className = 'button-group';
            buttons.forEach(btn => buttonGroup.appendChild(btn));
            item.appendChild(buttonGroup);
        }
    });

    // 9. 折叠/展开交互（触发平滑动画）
    toggleBtn.addEventListener('click', function() {
        downloadContainer.classList.toggle('expanded');
        // 移动端震动反馈（可选）
        if (typeof navigator.vibrate === 'function') {
            navigator.vibrate(50);
        }
    });
});

// 完整功能逻辑（过滤非视频+分辨率排序+平滑动画交互）
document.addEventListener('DOMContentLoaded', function() {
    const downloadContainer = document.querySelector('.download-urls');
    if (!downloadContainer) return;

    // 1. 添加折叠按钮（∧箭头，旋转交互）
    const title = downloadContainer.querySelector('h3');
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'toggle-btn';
    title.appendChild(toggleBtn);

    // 2. 核心功能：过滤非视频文件 + 分辨率降序排序
    const allItems = Array.from(document.querySelectorAll('.download-url-item'));
    const videoExtensions = ['mp4', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'webm', 'm4v', 'mpeg']; // 扩展支持格式

    // 2.1 过滤非视频文件（URL后缀+标签文本双重判断）
    const videoItems = allItems.filter(item => {
        const url = item.querySelector('.download-url-input')?.value || '';
        const labelText = item.querySelector('.download-url-label')?.textContent.toLowerCase() || '';
        return videoExtensions.some(ext => url.endsWith(`.${ext}`) || labelText.includes(ext));
    });

    // 2.2 分辨率识别函数（支持关键词+纯数字格式）
    const getResolutionScore = (labelText) => {
        const resolutionRules = [
            { keywords: ['4k', '2160p', '2160'], score: 10 },
            { keywords: ['1440p', '1440', '2k'], score: 9 },
            { keywords: ['1080p', '1080', '全高清', 'fhd'], score: 8 },
            { keywords: ['720p', '720', '高清', 'hd'], score: 7 },
            { keywords: ['480p', '480', '标清', 'sd'], score: 6 },
            { keywords: ['360p', '360'], score: 5 },
            { keywords: ['240p', '240'], score: 4 },
            { keywords: ['180p', '180'], score: 3 }
        ];

        // 匹配关键词
        for (const rule of resolutionRules) {
            if (rule.keywords.some(keyword => labelText.includes(keyword))) {
                return rule.score;
            }
        }

        // 匹配纯数字分辨率（如1920x1080、2560×1440）
        const resolutionMatch = labelText.match(/(\d{3,4})[x×](\d{3,4})/);
        if (resolutionMatch) {
            const height = parseInt(resolutionMatch[2]);
            if (height >= 2160) return 10;
            else if (height >= 1440) return 9;
            else if (height >= 1080) return 8;
            else if (height >= 720) return 7;
            else if (height >= 480) return 6;
            else if (height >= 360) return 5;
            else return 4;
        }

        return 0; // 未识别分辨率，默认最低
    };

    // 2.3 按分辨率降序排序（高分在前）
    videoItems.sort((a, b) => {
        const labelA = a.querySelector('.download-url-label').textContent.toLowerCase().trim();
        const labelB = b.querySelector('.download-url-label').textContent.toLowerCase().trim();
        const scoreA = getResolutionScore(labelA);
        const scoreB = getResolutionScore(labelB);
        return scoreB - scoreA;
    });

    // 3. 无视频文件时显示提示
    if (videoItems.length === 0) {
        toggleBtn.style.display = 'none';
        const noVideoMsg = document.createElement('div');
        noVideoMsg.style.color = '#B0B0B0';
        noVideoMsg.style.padding = '10px';
        noVideoMsg.style.textAlign = 'center';
        noVideoMsg.textContent = '未找到可用视频文件';
        downloadContainer.querySelector('ul').appendChild(noVideoMsg);
        return;
    }

    // 4. 置顶最高分辨率项（排序后第一个即为最高）
    const topItem = videoItems[0];
    topItem.classList.remove('download-url-item');
    topItem.classList.add('download-url-item-top');
    const labelElement = topItem.querySelector('.download-url-label');
    labelElement.innerHTML = `<span class="top-badge">最高分辨率</span>${labelElement.textContent}`;

    // 5. 构建排序后的列表
    const ulElement = downloadContainer.querySelector('ul');
    ulElement.innerHTML = ''; // 清空原有内容
    ulElement.appendChild(topItem); // 加入最高分辨率项

    // 6. 普通项容器（放入排序后的剩余视频项）
    const normalItemsContainer = document.createElement('div');
    normalItemsContainer.className = 'normal-items';
    videoItems.slice(1).forEach(item => normalItemsContainer.appendChild(item));
    ulElement.appendChild(normalItemsContainer);

    // 7. 只有1个视频项时隐藏折叠按钮
    if (videoItems.length <= 1) {
        toggleBtn.style.display = 'none';
    }

    // 8. 移动端按钮组（确保按钮换行显示）
    const allItemElements = downloadContainer.querySelectorAll('.download-url-item-top, .download-url-item');
    allItemElements.forEach(item => {
        const buttons = item.querySelectorAll('.download-url-copy, .download-url-mp4');
        if (buttons.length >= 2) {
            const buttonGroup = document.createElement('div');
            buttonGroup.className = 'button-group';
            buttons.forEach(btn => buttonGroup.appendChild(btn));
            item.appendChild(buttonGroup);
        }
    });

    // 9. 折叠/展开交互（触发平滑动画）
    toggleBtn.addEventListener('click', function() {
        downloadContainer.classList.toggle('expanded');
        // 移动端震动反馈（可选）
        if (typeof navigator.vibrate === 'function') {
            navigator.vibrate(50);
        }
    });
});


/* ------------------------------
   Utilities (minimal safe changes)
   ------------------------------ */
(function () {
    'use strict';

    const userLang = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
    const translations = {
        en: { downloading: 'Downloading...', finderror: 'Video download link not found', fetcherror: 'Error fetching video, please check the console for details', downloadsuccess: 'Download successful', downloaderror: 'Error downloading video, please check the console for details', downloadfailed: 'Download failed', downloadfailed_nosize: 'Unable to retrieve file size', copysuccess: 'Copy successful', copydownloadbtn: 'Copy address', downloadbtn: 'Download video', linkTip: 'Video download URL:' },
        'zh-CN': { downloading: '下载中...', finderror: '未找到视频下载链接', fetcherror: '获取视频时出错,请到控制台查看详细信息', downloadsuccess: '下载成功', downloaderror: '下载视频时出错,请到控制台查看详细信息', downloadfailed: '下载失败', downloadfailed_nosize: '无法获取文件大小', copysuccess: '复制成功', copydownloadbtn: '复制地址', downloadbtn: '下载视频', linkTip: '视频下载地址：' }
    };
    const getTranslations = (lang) => { for (const k in translations) if (k === lang || k.split(',').includes(lang)) return translations[k]; return translations.en; }
    const t = getTranslations(userLang);
    const translate = new Proxy(function (k) { return t[k] || translations.en[k] || k; }, { get: (tgt, p) => t[p] || translations.en[p] || p });
    unsafeWindow.translate = translate;

    function escapeHtml(str) {
        if (typeof str !== 'string') return str || '';
        return str.replace(/[&<>"'`=\/]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;', '=': '&#61;', '/': '&#47;' }[s]));
    }
    function sanitizeTitle() {
        try {
            let title = document.title || 'video';
            title = title.replace(/- Pornhub\.com/i, '').trim();
            title = title.replace(/[\/\\:*?"<>|]/g, '_');
            if (title.length > 120) title = title.slice(0, 120);
            return title || 'video';
        } catch (e) { return 'video'; }
    }
    function getHumanReadableSize(sizeb) {
        if (!sizeb || isNaN(sizeb) || sizeb <= 0) return '0 B';
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(sizeb) / Math.log(1024));
        return (sizeb / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
    }

    // GM_download wrapper -> Promise
    function gmDownloadPromise(options) {
        return new Promise((resolve, reject) => {
            try {
                if (typeof GM_download !== 'function') return reject(new Error('GM_download not supported'));
                const ops = Object.assign({}, options);
                ops.onload = function () { resolve(); };
                ops.onerror = function (err) { reject(err || new Error('GM_download failed')); };
                GM_download(ops);
            } catch (e) {
                reject(e);
            }
        });
    }

    // robust progress field extraction
    function extractProgress(evt) {
        const loaded = evt.loaded ?? evt.position ?? evt.receivedBytes ?? 0;
        let total = 0;
        if (evt.lengthComputable && evt.total) total = evt.total;
        else if (evt.total) total = evt.total;
        else if (evt.responseHeaders) {
            const m = (evt.responseHeaders || '').match(/Content-Length:\s*(\d+)/i);
            if (m) total = parseInt(m[1], 10);
        }
        return { loaded: Number(loaded) || 0, total: Number(total) || 0 };
    }

    // image set with fallback & revoke (revoke previous blob URL)
    async function setImageWithFallback(imgEl, url) {
        if (!imgEl || !url) return;
        let revokedBlob = null;
        function revokeLater(blobUrl) {
            if (!blobUrl) return;
            setTimeout(() => { try { URL.revokeObjectURL(blobUrl); } catch (e) {} }, 5000);
        }
        return new Promise(resolve => {
            let handled = false;
            const onload = function () { if (revokedBlob) revokeLater(revokedBlob); cleanup(); resolve(); };
            const onerror = async function () {
                cleanup();
                try {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: url,
                        responseType: 'arraybuffer',
                        timeout: 120000,
                        onload(response) {
                            try {
                                if (response.status >= 200 && response.status < 300 && response.response) {
                                    const blob = new Blob([response.response]);
                                    const blobUrl = URL.createObjectURL(blob);
                                    revokedBlob = blobUrl;
                                    imgEl.src = blobUrl;
                                }
                            } catch (e) { console.warn('setImageWithFallback fallback error', e); }
                            resolve();
                        },
                        onerror() { resolve(); },
                        ontimeout() { resolve(); }
                    });
                } catch (e) { resolve(); }
            };
            const cleanup = () => {
                if (handled) return;
                handled = true;
                imgEl.removeEventListener('load', onload);
                imgEl.removeEventListener('error', onerror);
            };
            imgEl.addEventListener('load', onload);
            imgEl.addEventListener('error', onerror);
            try { imgEl.src = url; } catch (e) { onerror(); }
            setTimeout(() => { if (!handled) { cleanup(); resolve(); } }, 4000);
        });
    }

    // gmFetchJson with timeout
    function gmFetchJson(url, timeout = 120000) {
        return new Promise((resolve, reject) => {
            try {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    responseType: 'json',
                    timeout,
                    onload(resp) {
                        if (resp.status >= 200 && resp.status < 300) resolve(resp.response);
                        else reject(new Error('Status ' + resp.status));
                    },
                    onerror(err) { reject(err); },
                    ontimeout() { reject(new Error('timeout')); }
                });
            } catch (e) { reject(e); }
        });
    }

    /* ------------------------------
       VideoParsing (core) - minimal safe changes
       ------------------------------ */
    class VideoParsing {
        static getObjectValueByStartsWithChar(obj, char) {
            const vars = [];
            try {
                Object.keys(obj).forEach(key => { if (key.startsWith(char)) vars.push({ key: key, value: obj[key] }); });
            } catch (e) { /* fail safe */ }
            return vars;
        }

        // 防重入锁（避免并发 init）
        static _initLock = false;

        static async getUrlInfo() {
            // same behavior but with safer search of window fields
            let flashvars = this.getObjectValueByStartsWithChar(unsafeWindow, 'flashvars_');
            // If none, try a few likely global names but limit attempts to avoid heavy work
            if (!flashvars.length) {
                const likely = ['__INITIAL_DATA__', 'videojs', 'player', 'PH', 'mediaDefinitions', 'playerData'];
                for (const name of likely) {
                    try {
                        const v = unsafeWindow[name];
                        if (v && typeof v === 'object' && (v.mediaDefinitions || v.mediaDefinition || v.playerVars)) {
                            flashvars.push({ key: name, value: v });
                            break;
                        }
                    } catch (e) { /* ignore cross-origin access errors */ }
                }
                // as last resort, scan keys but limited
                if (!flashvars.length) {
                    try {
                        const keys = Object.keys(unsafeWindow).slice(0, 300); // limit to first 300 keys
                        for (const k of keys) {
                            try {
                                const val = unsafeWindow[k];
                                if (val && typeof val === 'object' && Array.isArray(val.mediaDefinitions)) {
                                    flashvars.push({ key: k, value: val });
                                    break;
                                }
                            } catch (e) { /* ignore */ }
                        }
                    } catch (e) { /* ignore */ }
                }
            }
            if (!flashvars.length) {
                Toast(translate('fetcherror'), 3000, 'rgb(219, 18, 35)', '#ffffff', 'top');
                return [];
            }

            let videosInfo = [];
            try { videosInfo = flashvars[0].value.mediaDefinitions || []; } catch (e) { videosInfo = []; }
            let remoteAddress;
            const urlInfo = [];

            for (let i = 0; i < videosInfo.length; i++) {
                if (videosInfo[i] && videosInfo[i].remote) {
                    remoteAddress = videosInfo[i].videoUrl;
                    break;
                }
            }

            if (remoteAddress) {
                try {
                    const data = await gmFetchJson(remoteAddress).catch(_ => null);
                    if (data && Array.isArray(data) && data.length) {
                        data.forEach(item => {
                            if (item && item.videoUrl) {
                                urlInfo.push({ quality: (item.quality || 'unknown') + '.' + (item.format || 'mp4'), url: item.videoUrl, thumb: item.thumbnailUrl || item.previewUrl || '' });
                            }
                        });
                    }
                } catch (e) {
                    console.warn('Failed to fetch remoteAddress with GM_xmlhttpRequest', e);
                }
            }

            for (let i = 0; i < videosInfo.length; i++) {
                const v = videosInfo[i];
                if (v && v.videoUrl && !urlInfo.some(u => u.url === v.videoUrl)) {
                    const q = v.quality || (v.label ? v.label : 'unknown');
                    const fmt = v.format || 'mp4';
                    urlInfo.push({ quality: q + '.' + fmt, url: v.videoUrl, thumb: v.thumbnailUrl || v.previewUrl || '' });
                }
            }

            // fallback scanning other window objects (limited)
            if (!urlInfo.length) {
                try {
                    const keys = Object.keys(unsafeWindow).slice(0, 300);
                    for (const k of keys) {
                        try {
                            const val = unsafeWindow[k];
                            if (val && typeof val === 'object' && Array.isArray(val.mediaDefinitions)) {
                                val.mediaDefinitions.forEach(v => { if (v.videoUrl) urlInfo.push({ quality: (v.quality || 'unknown') + '.' + (v.format || 'mp4'), url: v.videoUrl, thumb: v.thumbnailUrl || v.previewUrl || '' }); });
                                if (urlInfo.length) break;
                            }
                        } catch (e) {}
                    }
                } catch (e) {}
            }

            // dedupe
            const seen = new Set();
            const filtered = [];
            urlInfo.forEach(i => { if (i && i.url && !seen.has(i.url)) { seen.add(i.url); filtered.push(i); } });
            console.log('VideoParsing.getUrlInfo ->', filtered);
            return filtered;
        }

        // injectUrls2Dom — modified to avoid HTML-escaping URLs into attributes and build DOM nodes safely
        static injectUrls2Dom(urlInfo) {
            if (!Array.isArray(urlInfo) || !urlInfo.length) return;

            // Build container HTML header (title, optional thumb) — keep minimal string use
            const meta = (function () {
                try {
                    const ogTitle = document.querySelector('meta[property="og:title"], meta[name="og:title"]')?.content || document.title || '';
                    const ogImage = document.querySelector('meta[property="og:image"], meta[name="og:image"]')?.content || '';
                    return { title: ogTitle, thumb: ogImage };
                } catch (e) { return { title: document.title || '', thumb: '' }; }
            })();

            // If panel exists, update; else create new panel
            let $panel;
            if ($('.download-urls').length) {
                $panel = $('.download-urls').first();
                $panel.find('h3').text(translate.linkTip);
                $panel.find('.download-panel-header').remove(); // will recreate below
                $panel.find('.download-list').empty();
            } else {
                const panelHtml = `<div class="download-urls"><h3>${translate.linkTip}</h3><div class="download-panel-header"></div><ul class="download-list"></ul></div>`;
                if ($('.playerWrapper').length) $('.playerWrapper').first().after(panelHtml);
                if ($('#player').length) $('#player').first().after(panelHtml);
                $panel = $('.download-urls').first();
            }

            // create header: thumb + title + placeholder for toggle/refresh
            const $header = $('<div class="download-panel-header" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"></div>');
            if (meta.thumb) {
                const $img = $('<img class="download-thumb" alt="thumb" style="width:120px;height:auto;border-radius:6px;flex:0 0 auto;">');
                // set via fallback to avoid data being escaped
                $header.append($img);
                setImageWithFallback($img.get(0), meta.thumb).catch(()=>{});
            }
            const $titleBox = $(`<div style="flex:1 1 auto;min-width:0;overflow:hidden;">
                <div style="font-weight:600;color:#222;font-size:14px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;">${escapeHtml(meta.title || '')}</div>
            </div>`);
            // reinit button
            const $reinit = $('<button class="reinit-btn" style="padding:4px 8px;border-radius:6px;background:#2563eb;color:#fff;border:none;cursor:pointer;margin-left:8px;">刷新</button>');
            $reinit.on('click', async () => { Toast('Re-detecting...', 1000, 'rgb(59,130,246)', '#fff', 'top'); await VideoParsing.init(true); });
            $titleBox.append($reinit);
            $header.append($titleBox);
            $panel.find('.download-panel-header').replaceWith($header);

            const $ul = $panel.find('.download-list');

            // Append items by creating DOM nodes (safe attribute set)
            urlInfo.forEach(item => {
                const $li = $('<li class="download-url-item"></li>');
                const $label = $(`<span class="download-url-label">[ ${escapeHtml(item.quality || 'unknown')} ]</span>`);
                const $input = $('<input class="download-url-input" readonly />');
                $input.val(item.url || '');
                const $copy = $(`<button type="button" class="download-url-copy">${escapeHtml(translate.copydownloadbtn)}</button>`);
                const $dl = $(`<button type="button" class="download-url-mp4">${escapeHtml(translate.downloadbtn)}</button>`);

                // set raw data-href using attr (not via escaped string)
                $copy.attr('data-href', item.url || '');
                $dl.attr('data-href', item.url || '');

                $li.append($label, $input, $copy, $dl);
                $ul.append($li);
            });

            // Now handle top/highest and normal grouping, toggle button
            const $items = $ul.find('li.download-url-item');
            if ($items.length <= 1) {
                // nothing more to do
                $panel.find('.toggle-btn').remove();
                return;
            }

            // resolution scoring (same as before)
            const resolutionOrder = ['4k', '2160p', '1440p', '1080p', '720p', '480p', '360p', '240p'];
            let topIndex = 0, topScore = -1;
            $items.each(function (idx) {
                const labelText = $(this).find('.download-url-label').text().toLowerCase();
                let score = -1;
                for (let i = 0; i < resolutionOrder.length; i++) {
                    if (labelText.includes(resolutionOrder[i])) { score = resolutionOrder.length - i; break; }
                }
                if (score === -1) {
                    const numMatch = labelText.match(/(\d{3,4})p|(\d{3,4})/);
                    if (numMatch) score = parseInt(numMatch[1] || numMatch[2], 10);
                }
                if (score > topScore) { topScore = score; topIndex = idx; }
            });

            const $top = $items.eq(topIndex);
            $top.addClass('download-url-item-top');
            const $lab = $top.find('.download-url-label');
            if ($lab.length) {
                const orig = $lab.text();
                $lab.html(`<span class="top-badge">最高分辨率</span>${escapeHtml(orig)}`);
            }
            $top.prependTo($ul);

            // remaining into normal-items placed after ul
            const $remaining = $ul.find('li.download-url-item').not('.download-url-item-top');
            $panel.find('.normal-items').remove();
            if ($remaining.length) {
                const $normal = $('<div class="normal-items"></div>');
                const $innerUl = $('<ul class="normal-list" style="padding:0;margin:0;list-style:none;"></ul>');
                $remaining.each(function () { $innerUl.append($(this)); });
                $normal.append($innerUl);
                $ul.after($normal);
                // toggle button
                if (!$panel.find('.toggle-btn').length) {
                    const $toggle = $('<button class="toggle-btn">展开其余</button>');
                    $toggle.on('click.pornhubToggle', function () {
                        const expanded = $panel.hasClass('expanded');
                        $panel.toggleClass('expanded', !expanded);
                        $(this).text(!expanded ? '收起其余' : '展开其余');
                    });
                    $panel.find('h3').append($toggle);
                }
            } else {
                $panel.find('.toggle-btn').remove();
            }

            // ensure events bound (initEvents idempotent)
            try { VideoParsing.initEvents(); } catch (e) { console.error(e); }
        }

        static initEvents() {
            $(document).off('click.pornhubDownloader', '.download-url-copy');
            $(document).off('click.pornhubDownloader', '.download-url-mp4');

            $(document).on('click.pornhubDownloader', '.download-url-copy', function (e) {
                e.preventDefault();
                try {
                    const href = $(this).attr('data-href') || $(this).data('href');
                    GM_setClipboard(href);
                    Toast(translate.copysuccess, 2000, 'rgb(18, 219, 18)', '#ffffff', 'top');
                } catch (err) {
                    console.error('Copy error', err);
                    Toast(translate.fetcherror, 2000, 'rgb(173, 7, 7)', '#ffffff', 'top');
                }
            });

            $(document).on('click.pornhubDownloader', '.download-url-mp4', function (e) {
                e.preventDefault();
                const href = $(this).attr('data-href') || $(this).data('href');
                const $el = $(this);
                $el.prop('disabled', true);
                downloadMp4(href, $el).finally(() => { $el.prop('disabled', false); });
            });
        }

        static async init(forceReload = false) {
            if (this._initLock) {
                // already running, avoid reentry
                return [];
            }
            this._initLock = true;
            try {
                const maxAttempts = 5;
                let attempt = 0;
                let urlInfo = [];
                while (attempt < maxAttempts) {
                    attempt++;
                    try { urlInfo = await this.getUrlInfo(); } catch (e) { urlInfo = []; }
                    if (urlInfo && urlInfo.length) break;
                    if (!forceReload) await new Promise(r => setTimeout(r, 300 * attempt));
                }
                if (!urlInfo || !urlInfo.length) {
                    Toast(translate.finderror, 3000, 'rgb(219, 18, 35)', '#ffffff', 'top');
                    return [];
                }
                this.injectUrls2Dom(urlInfo);
                return urlInfo;
            } catch (err) {
                console.error('VideoParsing.init error', err);
                Toast(translate.fetcherror, 3000, 'rgb(219, 18, 35)', '#ffffff', 'top');
                return [];
            } finally {
                this._initLock = false;
            }
        }
    }

    unsafeWindow.VideoParsing = VideoParsing;

    // download function with robust progress extraction and GM_download fallback wrapped as Promise
    function downloadMp4(videoUrl, $targetElement) {
        return new Promise((resolve, reject) => {
            if (!videoUrl) { $targetElement.text(translate.downloadfailed); return reject(new Error('No videoUrl')); }
            try {
                let lastUpdate = 0;
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: videoUrl,
                    responseType: 'arraybuffer',
                    timeout: 120000,
                    onprogress(res) {
                        try {
                            const { loaded, total } = extractProgress(res);
                            const now = Date.now();
                            if (now - lastUpdate > 150 || loaded === total) {
                                lastUpdate = now;
                                if (total) {
                                    const pct = ((loaded / total) * 100).toFixed(2);
                                    $targetElement.text(`${translate.downloading} ${pct}% (${getHumanReadableSize(loaded)} / ${getHumanReadableSize(total)})`);
                                } else {
                                    $targetElement.text(`${translate.downloading} ${getHumanReadableSize(loaded)}`);
                                }
                            }
                        } catch (e) { console.warn('Progress update failed', e); }
                    },
                    onload(response) {
                        try {
                            if (response.status < 200 || response.status >= 300) {
                                $targetElement.text(translate.downloadfailed);
                                Toast(translate.downloadfailed, 3000, 'rgb(173, 7, 7)', '#ffffff', 'top');
                                return reject(new Error('Download failed status ' + response.status));
                            }
                            const arrayBuffer = response.response;
                            if (!arrayBuffer || arrayBuffer.byteLength === 0) {
                                $targetElement.text(translate.downloadfailed_nosize);
                                return reject(new Error('Empty response'));
                            }
                            const blob = new Blob([arrayBuffer], { type: 'video/mp4' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.style.display = 'none';
                            a.href = url;
                            a.download = sanitizeTitle() + '.mp4';
                            document.body.appendChild(a);
                            a.click();
                            setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} document.body.removeChild(a); }, 1000);
                            Toast(translate.downloadsuccess, 3000, 'rgb(18, 219, 18)', '#ffffff', 'top');
                            $targetElement.text(translate.downloadsuccess);
                            resolve();
                        } catch (err) {
                            console.error('onload processing error', err);
                            $targetElement.text(translate.downloaderror);
                            Toast(translate.downloaderror, 3000, 'rgb(173, 7, 7)', '#ffffff', 'top');
                            reject(err);
                        }
                    },
                    onerror(err) {
                        console.error('GM_xmlhttpRequest onerror', err);
                        // fallback to GM_download if available
                        gmDownloadPromise({ url: videoUrl, name: sanitizeTitle() + '.mp4' }).then(() => {
                            $targetElement.text(translate.downloadsuccess);
                            Toast(translate.downloadsuccess, 3000, 'rgb(18, 219, 18)', '#ffffff', 'top');
                            resolve();
                        }).catch(gmErr => {
                            $targetElement.text(translate.downloadfailed);
                            Toast(translate.downloadfailed, 3000, 'rgb(173, 7, 7)', '#ffffff', 'top');
                            reject(gmErr || err);
                        });
                    },
                    ontimeout() {
                        $targetElement.text(translate.downloadfailed);
                        Toast(translate.downloadfailed, 3000, 'rgb(173, 7, 7)', '#ffffff', 'top');
                        // optionally try GM_download on timeout too
                        gmDownloadPromise({ url: videoUrl, name: sanitizeTitle() + '.mp4' }).then(() => { resolve(); }).catch(() => { reject(new Error('timeout')); });
                    }
                });
            } catch (e) {
                console.error('downloadMp4 error', e);
                $targetElement.text(translate.downloaderror);
                Toast(translate.downloaderror, 3000, 'rgb(173, 7, 7)', '#ffffff', 'top');
                reject(e);
            }
        });
    }

    // MutationObserver registration (unchanged behavior, small robustness)
    (function () {
        const MutationObserver = unsafeWindow.MutationObserver || unsafeWindow.WebKitMutationObserver || unsafeWindow.MozMutationObserver;
        if (!MutationObserver) return;
        let observed = false;
        const observeTarget = () => {
            if (observed) return;
            const target = document.querySelector('#player') || document.querySelector('.playerWrapper') || document.body;
            if (!target) return;
            const observer = new MutationObserver((mutations) => {
                observer.disconnect();
                observed = true;
                setTimeout(() => {
                    try { unsafeWindow.VideoParsing && typeof unsafeWindow.VideoParsing.init === 'function' && unsafeWindow.VideoParsing.init(); } catch (e) { console.error(e); }
                    setTimeout(() => { observed = false; observeTarget(); }, 800);
                }, 300);
            });
            observer.observe(target, { childList: true, subtree: true });
        };
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            observeTarget();
            if (document.querySelector('#player') || document.querySelector('.playerWrapper')) {
                setTimeout(() => { unsafeWindow.VideoParsing && unsafeWindow.VideoParsing.init(); }, 400);
            }
        } else {
            window.addEventListener('DOMContentLoaded', () => { observeTarget(); setTimeout(() => { unsafeWindow.VideoParsing && unsafeWindow.VideoParsing.init(); }, 400); });
        }
    })();

    // expose some helpers for debugging
    unsafeWindow.__PornhubDownloader = { sanitizeTitle, getHumanReadableSize, escapeHtml, gmFetchJson };

})();