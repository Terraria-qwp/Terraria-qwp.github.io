// ==UserScript==
// @name               Pornhub video download with one click
// @name:ar            Pornhub Video Download بنقرة واحدة
// @name:bg            Pornhub видео Изтеглете с едно щракване
// @name:cs            PornHub Video Stáhnout s jedním kliknutím
// @name:da            Pornhub video download med et enkelt klik
// @name:de            Pornhub Video Download mit einem Klick
// @name:el            Λήψη βίντεο pornhub με ένα κλικ
// @name:en            Pornhub video download with one click
// @name:eo            Pornhub Video Elŝuti per unu klako
// @name:es            Descarga de video pornhub con un solo clic
// @name:fi            Pornhub -videon lataa yhdellä napsautuksella
// @name:fr            Téléchargement vidéo pornhub en un clic
// @name:fr-CA         Téléchargement vidéo pornhub en un clic
// @name:he            הורדת וידאו של Pornhub בלחיצה אחת
// @name:hr            PornHub video preuzmi s jednim klikom
// @name:hu            Pornhub videó letöltése egy kattintással
// @name:id            Unduh video pornhub dengan satu klik
// @name:it            Download video di Pornhub con un clic
// @name:ja            ポルノハブビデオダウンロードワンクリックでダウンロードします
// @name:ka            Pornhub Video ჩამოტვირთვა ერთი დაჭერით
// @name:ko            한 번의 클릭으로 Pornhub 비디오 다운로드
// @name:nb            Pornhub video nedlasting med ett klikk
// @name:nl            Pornhub video downloaden met één klik
// @name:pl            Pobierz wideo Pornhub za pomocą jednego kliknięcia
// @name:pt-BR         Download de vídeo pornHub com um clique
// @name:ro            Descărcare video PornHub cu un singur clic
// @name:ru            Скачать видео Pornhub с одним щелчком
// @name:sk            Stiahnutie videa pornhub s jedným kliknutím
// @name:sr            ПорнХуб Видео Довнлоад са једним кликом
// @name:sv            Pornhub video nedladdning med ett klick
// @name:th            ดาวน์โหลดวิดีโอ Pornhub ด้วยคลิกเดียว
// @name:tr            Pornhub Video İndir Bir Tıkla İndir
// @name:ug            Pornhub سىن چۈشۈرۈش بىر چېكىش ئارقىلىق
// @name:uk            Завантажити відео Pornhub одним клацанням
// @name:vi            Tải xuống video pornhub chỉ bằng một cú nhấp chuột
// @name:zh            Pornhub 视频一键下载
// @name:zh-CN         Pornhub 视频一键下载
// @name:zh-HK         Pornhub 視頻一鍵下載
// @name:zh-SG         Pornhub 视频一键下载
// @name:zh-TW         Pornhub 視頻一鍵下載
// @description        Pornhub video download with one click | pornhub.com | Download directly without login | Download free to watch paid videos | Download videos that are prohibited | Download all v[...]
// @grant              unsafeWindow
// @grant              GM_setClipboard
// @grant              GM_download
// @grant              GM_addStyle
// @grant              GM_xmlhttpRequest
// @match              *://*.pornhub.com/view_video.php?viewkey=*
// @match              *://*.pornhubpremium.com/view_video.php?viewkey=*
// @require            https://update.greasyfork.org/scripts/498897/1404834/Toastnew.js
// @require            https://code.jquery.com/jquery-3.7.1.min.js
// @author             liuwanlin,heckles,人民的勤务员 <china.qinwuyuan@gmail.com>
// @namespace          https://github.com/ChinaGodMan/UserScripts
// @supportURL         https://github.com/ChinaGodMan/UserScripts/issues
// @homepageURL        https://github.com/ChinaGodMan/UserScripts
// @homepage           https://github.com/ChinaGodMan/UserScripts
// @license            MIT
// @version            2025.05.01.0128
// ==/UserScript==

/* 完整修复与优化说明（概要）：
   - 修复了原脚本中类外顶层 `static` 导致的语法错误（已清除）。
   - 将同步请求改为异步 GM_xmlhttpRequest，解决 CORS 与阻塞问题。
   - 使用 GM_xmlhttpRequest 下载并显示稳定的进度（支持跨域）。
   - 修复 getHumanReadableSize(0) 的异常。
   - 在多次 init 时避免事件重复绑定（使用事件命名空间）。
   - 在注入 DOM 时处理去重/更新，避免重复面板。
   - 增强各处错误处理和日志，防止未定义访问错误。
*/

GM_addStyle(`
    .download-urls { margin: 15px 0; padding: 10px; background: #f5f5f5; border-radius: 8px; }
    .download-urls h3 { margin: 0 0 10px 0; color: #333; font-size: 16px; }
    .download-urls ul { padding: 0; margin: 0; list-style: none; font-weight: normal; line-height: 1.8; }
    .download-urls ul li { 
        display: flex; 
        align-items: center; 
        padding: 8px 0; 
        max-width: 100%; 
        flex-wrap: wrap; 
        gap: 8px;
    }
    .download-url-label { 
        width: 80px; 
        text-align: right; 
        color: #666; 
        flex-shrink: 0;
    }
    .download-url-input { 
        flex: 1; 
        min-width: 150px; 
        font-size: 12px; 
        padding: 4px 8px; 
        border: 1px solid #ddd; 
        border-radius: 4px; 
        margin: 0;
    }
    .download-url-copy, .download-url-mp4 { 
        padding: 4px 12px; 
        border-radius: 4px; 
        text-decoration: none; 
        color: #fff; 
        cursor: pointer; 
        flex-shrink: 0; 
    }
    .download-url-copy { background: #4299e1; }
    .download-url-mp4 { background: #22c55e; }
    .download-url-copy:hover, .download-url-mp4:hover { opacity: 0.9; }
    @media (max-width: 768px) {
        .download-url-label { 
            width: 100%; 
            text-align: left; 
            margin-bottom: 4px; 
        }
        .download-url-input { min-width: 100%; }
    }
`);

(function () {
    'use strict';

    // 语言与翻译
    const userLang = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
    const translations = {
        'en': {
            downloading: 'Downloading...',
            finderror: 'Video download link not found',
            fetcherror: 'Error fetching video, please check the console for details',
            downloadsuccess: 'Download successful',
            downloaderror: 'Error downloading video, please check the console for details',
            downloadfailed: 'Download failed',
            downloadfailed_nosize: 'Unable to retrieve file size',
            copysuccess: 'Copy successful',
            copydownloadbtn: 'Copy address',
            downloadbtn: 'Download video',
            linkTip: 'Video download URL:'
        },
        'zh-CN,zh,zh-SG': {
            downloading: '下载中...',
            finderror: '未找到视频下载链接',
            fetcherror: '获取视频时出错,请到控制台查看详细信息',
            downloadsuccess: '下载成功',
            downloaderror: '下载视频时出错,请到控制台查看详细信息',
            downloadfailed: '下载失败',
            downloadfailed_nosize: '无法获取文件大小',
            copysuccess: '复制成功',
            copydownloadbtn: '复制地址',
            downloadbtn: '下载视频',
            linkTip: '视频下载地址：'
        },
        'zh-TW,zh-HK,zh-MO': {
            downloading: '下載中...',
            finderror: '未找到視頻下載連結',
            fetcherror: '獲取視頻時出錯，請到控制台查看詳細信息',
            downloadsuccess: '下載成功',
            downloaderror: '下載視頻時出錯，請到控制台查看詳細信息',
            downloadfailed: '下載失敗',
            downloadfailed_nosize: '無法獲取文件大小',
            copysuccess: '複製成功',
            copydownloadbtn: '複製地址',
            downloadbtn: '下載視頻',
            linkTip: '視頻下載地址：'
        },
        'ja': {
            downloading: 'ダウンロード中...',
            finderror: 'ビデオのダウンロードリンクが見つかりません',
            fetcherror: 'ビデオの取得中にエラーが発生しました。詳細はコンソールを確認してください',
            downloadsuccess: 'ダウンロード成功',
            downloaderror: 'ビデオのダウンロード中にエラーが発生しました。詳細はコンソールを確認してください',
            downloadfailed: 'ダウンロード失敗',
            downloadfailed_nosize: 'ファイルサイズを取得できません',
            copysuccess: 'コピー成功',
            copydownloadbtn: 'アドレスをコピー',
            downloadbtn: 'ビデオをダウンロード',
            linkTip: 'ビデオダウンロードURL：'
        },
        'vi': {
            downloading: 'Đang tải xuống...',
            finderror: 'Không tìm thấy liên kết tải video',
            fetcherror: 'Lỗi khi tải video, vui lòng kiểm tra bảng điều khiển để biết chi tiết',
            downloadsuccess: 'Tải xuống thành công',
            downloaderror: 'Lỗi khi tải video, vui lòng kiểm tra bảng điều khiển để biết chi tiết',
            downloadfailed: 'Tải xuống thất bại',
            downloadfailed_nosize: 'Không thể lấy kích thước tệp',
            copysuccess: 'Sao chép thành công',
            copydownloadbtn: 'Sao chép địa chỉ',
            downloadbtn: 'Tải xuống video',
            linkTip: 'URL tải video:'
        },
        'fr': {
            downloading: 'Téléchargement...',
            finderror: 'Lien de téléchargement vidéo introuvable',
            fetcherror: 'Erreur lors de la récupération de la vidéo, veuillez vérifier la console pour plus de détails',
            downloadsuccess: 'Téléchargement réussi',
            downloaderror: 'Erreur lors du téléchargement de la vidéo, veuillez vérifier la console pour plus de détails',
            downloadfailed: 'Échec du téléchargement',
            downloadfailed_nosize: 'Impossible de récupérer la taille du fichier',
            copysuccess: 'Copie réussie',
            copydownloadbtn: 'Copier l’adresse',
            downloadbtn: 'Télécharger la vidéo',
            linkTip: 'URL de téléchargement vidéo :'
        },
        'es': {
            downloading: 'Descargando...',
            finderror: 'No se encontró el enlace de descarga del video',
            fetcherror: 'Error al obtener el video, consulte la consola para más detalles',
            downloadsuccess: 'Descarga exitosa',
            downloaderror: 'Error al descargar el video, consulte la consola para más detalles',
            downloadfailed: 'Error en la descarga',
            downloadfailed_nosize: 'No se puede obtener el tamaño del archivo',
            copysuccess: 'Copia exitosa',
            copydownloadbtn: 'Copiar dirección',
            downloadbtn: 'Descargar video',
            linkTip: 'URL de descarga del video:'
        }
    };

    const getTranslations = (lang) => {
        for (const key in translations) {
            if (key === lang || key.split(',').includes(lang)) {
                return translations[key];
            }
        }
        return translations['en'];
    };

    const translate = new Proxy(
        function (key) {
            const lang = userLang;
            const strings = getTranslations(lang);
            return (strings && strings[key]) || translations['en'][key] || key;
        },
        {
            get(target, prop) {
                const lang = userLang;
                const strings = getTranslations(lang);
                return (strings && strings[prop]) || translations['en'][prop] || prop;
            }
        }
    );
    unsafeWindow.translate = translate;

    // MutationObserver：等待 player 出现并触发解析
    const MutationObserver = unsafeWindow.MutationObserver || unsafeWindow.WebKitMutationObserver || unsafeWindow.MozMutationObserver;
    const mutationObserver = new MutationObserver((mutations) => {
        mutationObserver.disconnect();
        setTimeout(() => {
            try {
                if (unsafeWindow.VideoParsing && typeof unsafeWindow.VideoParsing.init === 'function') {
                    // init 可能返回 Promise
                    const res = unsafeWindow.VideoParsing.init();
                    if (res && typeof res.then === 'function') {
                        res.catch(err => console.error('VideoParsing.init error:', err));
                    }
                } else {
                    // 如果还没定义 VideoParsing，稍后再试一次（容错）
                    setTimeout(() => {
                        if (unsafeWindow.VideoParsing && typeof unsafeWindow.VideoParsing.init === 'function') {
                            unsafeWindow.VideoParsing.init().catch(err => console.error('VideoParsing.init error:', err));
                        } else {
                            Toast(translate('finderror'), 3000, 'rgb(219, 18, 35)', '#ffffff', 'top');
                        }
                    }, 300);
                }
            } catch (e) {
                console.error(e);
            }
        }, 200);
    });

    let playerdiv;
    if (document.querySelector('#player')) {
        playerdiv = document.querySelector('#player');
    } else {
        playerdiv = document.querySelector('.playerWrapper');
    }
    const playerDom = playerdiv;

    if (playerDom) {
        mutationObserver.observe(playerDom, {
            childList: true,
            subtree: true
        });
    } else {
        Toast(translate('finderror'), 3000, 'rgb(219, 18, 35)', '#ffffff', 'top');
    }
})();

(function () {
    'use strict';

    class VideoParsing {
        // 根据 key 开头字母获取对象中的值，返回数组
        static getObjectValueByStartsWithChar(obj, char) {
            const vars = [];
            Object.keys(obj).forEach(key => {
                if (key.startsWith(char)) {
                    vars.push({
                        key: key,
                        value: obj[key]
                    });
                }
            });
            return vars;
        }

        // 获取下载地址信息（异步），返回 Promise<array>
        static async getUrlInfo() {
            const flashvars = this.getObjectValueByStartsWithChar(unsafeWindow, 'flashvars_');
            if (!flashvars.length) {
                Toast(translate('fetcherror'), 3000, 'rgb(219, 18, 35)', '#ffffff', 'top');
                return [];
            }
            let videosInfo = [];
            try {
                videosInfo = flashvars[0]['value']['mediaDefinitions'] || [];
            } catch (e) {
                Toast(translate('fetcherror'), 3000, 'rgb(219, 18, 35)', '#ffffff', 'top');
                console.error(translate('fetcherror'), e, flashvars);
                return [];
            }

            let remoteAddress;
            const urlInfo = [];

            for (let i = 0; i < videosInfo.length; i++) {
                if (videosInfo[i] && videosInfo[i]['remote']) {
                    remoteAddress = videosInfo[i]['videoUrl'];
                    break;
                }
            }

            // 当有 remote 地址时，用 GM_xmlhttpRequest 获取 MP4 列表（跨域友好）
            if (remoteAddress) {
                try {
                    const data = await new Promise((resolve, reject) => {
                        try {
                            GM_xmlhttpRequest({
                                method: 'GET',
                                url: remoteAddress,
                                responseType: 'json',
                                onload(response) {
                                    if (response.status >= 200 && response.status < 300) {
                                        resolve(response.response);
                                    } else {
                                        reject(new Error('Remote address fetch failed: ' + response.status));
                                    }
                                },
                                onerror(err) {
                                    reject(err);
                                },
                                ontimeout() {
                                    reject(new Error('Request timed out'));
                                },
                                timeout: 20000
                            });
                        } catch (err) {
                            reject(err);
                        }
                    });
                    if (data && Array.isArray(data) && data.length) {
                        data.forEach(item => {
                            if (item && item.videoUrl) {
                                urlInfo.push({
                                    quality: (item.quality || 'unknown') + '.' + (item.format || 'mp4'),
                                    url: item.videoUrl
                                });
                            }
                        });
                    }
                } catch (e) {
                    console.warn('Failed to fetch remoteAddress with GM_xmlhttpRequest', e);
                }
            }

            // 作为回退：直接从 videosInfo 中提取 videoUrl（非 remote 情况）
            for (let i = 0; i < videosInfo.length; i++) {
                const v = videosInfo[i];
                if (v && v.videoUrl && !urlInfo.some(u => u.url === v.videoUrl)) {
                    const q = v.quality || (v.label ? v.label : 'unknown');
                    const fmt = v.format || 'mp4';
                    urlInfo.push({
                        quality: q + '.' + fmt,
                        url: v.videoUrl
                    });
                }
            }

            console.log('VideoParsing.getUrlInfo -> urlInfo:', urlInfo);
            return urlInfo;
        }

        // 注入到下载面板（去重/更新）
        static injectUrls2Dom(urlInfo) {
            if (!Array.isArray(urlInfo) || !urlInfo.length) {
                return;
            }
            const li = urlInfo.map(item => `
                <li>
                    <span class="download-url-label">[ ${escapeHtml(item.quality)} ]</span>
                    <input class="download-url-input" value="${escapeHtml(item.url)}" readonly />
                    <a class="download-url-copy" data-href="${escapeHtml(item.url)}" href="javascript: void(0);">${translate.copydownloadbtn}</a>
                    <a class="download-url-mp4" data-href="${escapeHtml(item.url)}" href="javascript: void(0);">${translate.downloadbtn}</a>
                </li>
            `);

            // 如果已经存在，则只更新内容，避免重复面板
            if ($('.download-urls').length) {
                $('.download-urls').each(function () {
                    $(this).find('ul').html(li.join(''));
                });
            } else {
                // 插入到两处（playerWrapper 和 #player）并保持一致
                const panelHtml = `<div class="download-urls"><h3>${translate.linkTip}</h3><ul>${li.join('')}</ul></div>`;
                if ($('.playerWrapper').length) {
                    $('.playerWrapper').first().after(panelHtml);
                }
                if ($('#player').length) {
                    $('#player').first().after(panelHtml);
                }
            }
        }

        // 初始化事件（只绑定一次，使用命名空间以防重复）
        static initEvents() {
            // 先解绑同命名空间的事件，避免重复注册
            $(document).off('click.pornhubDownloader', '.download-url-copy');
            $(document).off('click.pornhubDownloader', '.download-url-mp4');

            $(document).on('click.pornhubDownloader', '.download-url-copy', function (e) {
                e.preventDefault();
                try {
                    const href = $(this).data('href');
                    GM_setClipboard(href);
                    Toast(translate.copysuccess, 2000, 'rgb(18, 219, 18)', '#ffffff', 'top');
                } catch (err) {
                    console.error('Copy error', err);
                    Toast(translate.fetcherror, 2000, 'rgb(173, 7, 7)', '#ffffff', 'top');
                }
            });

            $(document).on('click.pornhubDownloader', '.download-url-mp4', function (e) {
                e.preventDefault();
                const href = $(this).data('href');
                const $el = $(this);
                $el.prop('disabled', true);
                downloadMp4(href, $el).finally(() => {
                    $el.prop('disabled', false);
                });
            });
        }

        // 初始化（可以多次调用，内部是幂等的）
        static async init() {
            try {
                const urlInfo = await this.getUrlInfo();
                if (!urlInfo || !urlInfo.length) {
                    Toast(translate.finderror, 3000, 'rgb(219, 18, 35)', '#ffffff', 'top');
                    return;
                }
                this.injectUrls2Dom(urlInfo);
                this.initEvents();
            } catch (err) {
                console.error('VideoParsing.init error', err);
                Toast(translate.fetcherror, 3000, 'rgb(219, 18, 35)', '#ffffff', 'top');
            }
        }
    }

    unsafeWindow.VideoParsing = VideoParsing;

    // 工具：Sanitize filename
    function sanitizeTitle() {
        try {
            let title = document.title || 'video';
            title = title.replace(/- Pornhub\.com/i, '').trim();
            // 移除非法文件名字符并限制长度
            title = title.replace(/[\/\\:*?"<>|]/g, '_');
            if (title.length > 120) title = title.slice(0, 120);
            return title;
        } catch (e) {
            return 'video';
        }
    }

    // 工具：转化字节（处理 0）
    function getHumanReadableSize(sizeb) {
        if (!sizeb || isNaN(sizeb) || sizeb <= 0) return '0 B';
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(sizeb) / Math.log(1024));
        const humanReadableSize = (sizeb / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
        return humanReadableSize;
    }

    // 工具：HTML escape（防注入）
    function escapeHtml(str) {
        if (typeof str !== 'string') return str;
        return str.replace(/[&<>"'`=\/]/g, function (s) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
                '`': '&#96;',
                '=': '&#61;',
                '/': '&#47;'
            }[s];
        });
    }

    // 下载：使用 GM_xmlhttpRequest 以支持跨域与进度回调
    function downloadMp4(videoUrl, $targetElement) {
        return new Promise((resolve, reject) => {
            if (!videoUrl) {
                $targetElement.text(translate.downloadfailed);
                return reject(new Error('No videoUrl'));
            }
            try {
                let lastUpdate = 0;
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: videoUrl,
                    responseType: 'arraybuffer',
                    onprogress(res) {
                        try {
                            const loaded = res.loaded || 0;
                            const total = res.lengthComputable ? res.total : (res.total || 0);
                            const now = Date.now();
                            // 限制更新频率，避免频繁 DOM 操作
                            if (now - lastUpdate > 150 || loaded === total) {
                                lastUpdate = now;
                                if (total) {
                                    const pct = ((loaded / total) * 100).toFixed(2);
                                    $targetElement.text(`${translate.downloading} ${pct}% (${getHumanReadableSize(loaded)} / ${getHumanReadableSize(total)})`);
                                } else {
                                    $targetElement.text(`${translate.downloading} ${getHumanReadableSize(loaded)}`);
                                }
                            }
                        } catch (e) {
                            console.warn('Progress update failed', e);
                        }
                    },
                    onload(response) {
                        try {
                            if (response.status < 200 || response.status >= 300) {
                                $targetElement.text(translate.downloadfailed);
                                Toast(translate.downloadfailed, 3000, 'rgb(173, 7, 7)', '#ffffff', 'top');
                                return reject(new Error('Download failed status ' + response.status));
                            }
                            const arrayBuffer = response.response;
                            if (!arrayBuffer) {
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
                            setTimeout(() => {
                                URL.revokeObjectURL(url);
                                document.body.removeChild(a);
                            }, 1000);
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
                        $targetElement.text(translate.downloadfailed);
                        Toast(translate.downloadfailed, 3000, 'rgb(173, 7, 7)', '#ffffff', 'top');
                        reject(err);
                    },
                    ontimeout() {
                        $targetElement.text(translate.downloadfailed);
                        Toast(translate.downloadfailed, 3000, 'rgb(173, 7, 7)', '#ffffff', 'top');
                        reject(new Error('Timeout'));
                    },
                    timeout: 0 // 不超时，取决于需要；可改为 120000（2 分钟）等
                });
            } catch (e) {
                console.error('downloadMp4 error', e);
                $targetElement.text(translate.downloaderror);
                Toast(translate.downloaderror, 3000, 'rgb(173, 7, 7)', '#ffffff', 'top');
                reject(e);
            }
        });
    }
})();