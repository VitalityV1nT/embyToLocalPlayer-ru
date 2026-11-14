// ==UserScript==
// @name         embyToLocalPlayer
// @namespace    https://github.com/VitalityV1nT/embyToLocalPlayer-ru
// @version      2026.11.14
// @description  Воспроизведение во внешнем плеере и обновление прогресса воспроизведения для Jellyfin. Форк kjtsune/embyToLocalPlayer.
// @author       VitalityV1nT
// @match        *://*/web/index.html*
// @match        *://*/*/web/index.html*
// @match        *://*/web/
// @match        *://*/*/web/
// @match        https://app.emby.media/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=emby.media
// @grant        unsafeWindow
// @grant        GM_info
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-start
// @connect      127.0.0.1
// @license MIT
// @homepageURL  https://github.com/VitalityV1nT/embyToLocalPlayer-ru
// @supportURL   https://github.com/VitalityV1nT/embyToLocalPlayer-ru/issues
// @downloadURL  https://raw.githubusercontent.com/VitalityV1nT/embyToLocalPlayer-ru/refs/heads/main/user_script/embyToLocalPlayer.user.js
// @updateURL    https://raw.githubusercontent.com/VitalityV1nT/embyToLocalPlayer-ru/refs/heads/main/user_script/embyToLocalPlayer.user.js
// ==/UserScript==
'use strict';
/*global ApiClient*/

(function () {
    'use strict';
    let fistTime = true;
    let config = {
        logLevel: 2,
        disableOpenFolder: undefined, // undefined 改为 true 则禁用打开文件夹的按钮。
        crackFullPath: undefined,
        disableForLiveTv: undefined, // undefined 改为 true 则在浏览器里播放 IPTV。
        enableResumeReorder: true, // true 改为 undefined 则禁用。继续观看的前2位不变, 余下近3天更新的前移。
    };

    let etlpStorageKeys = {
        webPlayerEnable: 'webPlayerEnable',
        mountDiskEnable: 'mountDiskEnable',
        crackFullPath: 'etlpCrackFullPath',
        cacheResumeIds: 'etlpCacheResumeIds',
        extPlayerButtonHidden: 'extPlayerButtonHidden',
        extPlayerIconDisabled: 'extPlayerIconDisabled',
    }

    const originFetch = fetch;

    let logger = {
        error: function (...args) {
            if (config.logLevel >= 1) {
                console.log('%cERROR', 'color: #fff; background: #d32f2f; font-weight: bold; padding: 2px 6px; border-radius: 3px;', ...args);
            }
        },
        info: function (...args) {
            if (config.logLevel >= 2) {
                console.log('%cINFO', 'color: #fff; background: #1976d2; font-weight: bold; padding: 2px 6px; border-radius: 3px;', ...args);
            }
        },
        debug: function (...args) {
            if (config.logLevel >= 3) {
                console.log('%cDEBUG', 'color: #333; background: #ffeb3b; font-weight: bold; padding: 2px 6px; border-radius: 3px;', ...args);
            }
        },
    };

    function myBool(value) {
        if (Array.isArray(value) && value.length === 0) return false;
        if (value !== null && typeof value === 'object' && Object.keys(value).length === 0) return false;
        return Boolean(value);
    }

    async function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function isHidden(el) {
        return (el.offsetParent === null);
    }

    function getVisibleElement(elList) {
        if (!elList) return;
        if (Object.prototype.isPrototypeOf.call(NodeList.prototype, elList)) {
            for (let i = 0; i < elList.length; i++) {
                if (!isHidden(elList[i])) {
                    return elList[i];
                }
            }
        } else {
            return elList;
        }
    }

    function overwriteConfByStore() {
        function overwriteByKey(confKey) {
            let confLocal = localStorage.getItem(confKey);
            if (confLocal == null) return;
            if (confLocal == 'true') {
                GM_setValue(confKey, true);

            } else if (confLocal == 'false') {
                GM_setValue(confKey, false);
            }
            let confGM = GM_getValue(confKey, null);
            if (confGM !== null) {
                let _confKey = confKey.replace(/^etlp/, '');
                _confKey = _confKey.charAt(0).toLowerCase() + _confKey.slice(1);
                config[_confKey] = confGM;
            };
        }
        overwriteByKey(etlpStorageKeys.crackFullPath);
    }

    function getPlaybackModeText() {
        const mountDisk = localStorage.getItem(etlpStorageKeys.mountDiskEnable) === 'true';
        return mountDisk ? 'Режим воспроизведения с жесткого диска' : 'Режим воспроизведения из Jellyfin';
    }

    function playNotifiy(title = 'embyToLocalPlayer', subtitle = getPlaybackModeText()) {
        if (!document.getElementById('play-notification-style')) {
            const style = document.createElement('style');
            style.id = 'play-notification-style';
            style.textContent = `
                @keyframes slideIn { from { transform: translateX(400px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
                @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(400px); opacity: 0; } }
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
            `;
            document.head.appendChild(style);
        }

        const notification = document.createElement('div');
        notification.innerHTML = `
            <svg width="40" height="40" viewBox="0 0 24 24" style="animation: pulse 1.5s ease-in-out infinite; flex-shrink: 0;">
                <circle cx="12" cy="12" r="10" stroke="white" stroke-width="2" fill="none" opacity="0.3"/>
                <path d="M9 8L17 12L9 16V8Z" fill="white"/>
            </svg>
            <div>
                <div style="font-weight: 600; font-size: 16px;">${title}</div>
                <div style="font-size: 13px; opacity: 0.9;">${subtitle}</div>
            </div>
        `;

        notification.style.cssText = `
            position: fixed; bottom: 30px; right: 30px; z-index: 999999;
            background: rgba(24, 26, 32, 0.95);
            border: 2px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px; padding: 20px 25px; color: white;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            display: flex; align-items: center; gap: 15px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            animation: slideIn 0.5s ease-out;
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.5s ease-in forwards';
            notification.addEventListener('animationend', (e) => {
                if (e.animationName === 'slideOut') notification.remove();
            }, { once: true });
            setTimeout(() => notification.remove(), 700);
        }, 5000);
    }

    let menuRegistry = [];
    let registeredMenus = [];

    function switchLocalStorage(key, defaultValue = 'true', trueValue = 'true', falseValue = 'false') {
        if (key in localStorage) {
            let value = (localStorage.getItem(key) === trueValue) ? falseValue : trueValue;
            localStorage.setItem(key, value);
        } else {
            localStorage.setItem(key, defaultValue);
        }
        logger.info('switchLocalStorage', key, 'to', localStorage.getItem(key));
    }

    function registerAllMenus() {
        registeredMenus.forEach(id => GM_unregisterMenuCommand(id));
        registeredMenus = [];

        menuRegistry.forEach(item => {
            let id;

            if (item.type === 'switch') {
                let title = item.menuStart + item.switchNameMap[localStorage.getItem(item.storageKey)] + item.menuEnd;
                id = GM_registerMenuCommand(title, () => {
                    switchLocalStorage(item.storageKey);
                    registerAllMenus();
                    refreshExtPlayerUI();
                });
            } else if (item.type === 'callback') {
                id = GM_registerMenuCommand(item.title, item.callback);
            }

            registeredMenus.push(id);
            item.menuId = id;
        });
    }

    function setModeSwitchMenu(storageKey, menuStart = '', menuEnd = '', defaultValue = 'ВЫКЛ', trueValue = 'ВКЛ', falseValue = 'ВЫКЛ') {
        let switchNameMap = { 'true': trueValue, 'false': falseValue, null: defaultValue };

        menuRegistry.push({
            type: 'switch',
            storageKey,
            menuStart,
            menuEnd,
            switchNameMap
        });

        registerAllMenus();
    }

    // External Player Button
    const EP_BTN_CLASS = 'extplayer-toggle-btn';
    const EP_STYLE_ID = 'extplayer-toggle-style';
    const EP_ICON_SRC = 'data:image/png;base64,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';
    const EP_ICON_STYLE_ID = 'extplayer-icon-style';
    const EP_ROOT_ATTR = 'data-etlp-external';

    function injectExtPlayerStyle() {
        if (document.getElementById(EP_STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = EP_STYLE_ID;
        style.textContent = `
            .${EP_BTN_CLASS} {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                flex: 0 0 auto;
                width: auto;
                height: auto;
                min-width: auto;
                padding: .556em;
                margin: 0 .29em;
                border: 0;
                border-radius: 50%;
                background: transparent;
                cursor: pointer;
                line-height: 1;
                box-sizing: border-box;
                transition: transform 0.05s ease;
            }

            .${EP_BTN_CLASS}:hover {
                background: transparent;
                border-color: transparent;
            }

            .${EP_BTN_CLASS}:active {
                transform: scale(.90);
            }

            .${EP_BTN_CLASS}:focus-visible {
                outline: 2px solid rgba(255,255,255,.35);
                outline-offset: 2px;
            }

            .${EP_BTN_CLASS} img {
                display: block;
                width: 26.5px;
                height: 26.5px;
                object-fit: contain;
                pointer-events: none;
                user-select: none;
                -webkit-user-drag: none;
                transition: filter 0.1s linear 0.07s, opacity 0.1s linear 0.07s;
            }

            .${EP_BTN_CLASS}[data-enabled="false"] img {
                filter: grayscale(1);
                opacity: .20;
            }
        `;

        document.head.appendChild(style);
    }

    function injectExtPlayerIconStyle() {
        if (document.getElementById(EP_ICON_STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = EP_ICON_STYLE_ID;
        style.textContent = `
            :root { --etlp-icon: url("${EP_ICON_SRC}"); }

            /* Замена значка воспроизведения */
            html[${EP_ROOT_ATTR}="true"] .actionsheetMenuItemIcon.play_arrow::before,
            html[${EP_ROOT_ATTR}="true"] .cardOverlayButtonIcon.play_arrow::before,
            html[${EP_ROOT_ATTR}="true"] .detailButton-icon.play_arrow::before,
            html[${EP_ROOT_ATTR}="true"] .listItemImageButton-icon.play_arrow::before {
                content: "" !important;
                display: block;
                width: 1em;
                height: 1em;
                background: var(--etlp-icon) center / contain no-repeat;
            }

            html[${EP_ROOT_ATTR}="true"] .cardOverlayContainer > .cardOverlayFab-primary {
                will-change: transform;
            }

            /* Подсветка значка на кнопке «Воспроизвести» на странице элемента */
            html[${EP_ROOT_ATTR}="true"] .btnPlay .detailButton-icon {
                transition: filter .1s ease;
            }

            html[${EP_ROOT_ATTR}="true"] .btnPlay:hover .detailButton-icon,
            html[${EP_ROOT_ATTR}="true"] .btnPlay:focus-visible .detailButton-icon {
                filter: brightness(1.2)
                        drop-shadow(0 0 4px rgb(var(--jf-palette-primary-mainChannel, 0 164 220) / .9));
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function applyExtPlayerModeFlag() {
        const root = document.documentElement;
        if (!root) return;
        const externalOn = localStorage.getItem(etlpStorageKeys.webPlayerEnable) !== 'true';
        const iconOn = localStorage.getItem(etlpStorageKeys.extPlayerIconDisabled) !== 'true';
        root.setAttribute(EP_ROOT_ATTR, String(externalOn && iconOn));
    }

    function updateExtPlayerButton(btn) {
        const enabled = localStorage.getItem(etlpStorageKeys.webPlayerEnable) !== 'true';

        btn.dataset.enabled = String(enabled);
        btn.title = enabled ? getPlaybackModeText() : 'Внешний плеер выключен';
        btn.setAttribute('aria-pressed', String(enabled));
    }

    function createExtPlayerButton() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = EP_BTN_CLASS;
        btn.setAttribute('aria-label', 'Внешний плеер');

        const img = document.createElement('img');
        img.src = EP_ICON_SRC;
        img.alt = '';
        img.decoding = 'async';

        btn.appendChild(img);
        updateExtPlayerButton(btn);

        btn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();

            switchLocalStorage(etlpStorageKeys.webPlayerEnable);

            registerAllMenus();
            refreshExtPlayerUI();
        });

        return btn;
    }

    function syncExtPlayerButton() {
        const buttonHidden =
            localStorage.getItem(etlpStorageKeys.extPlayerButtonHidden) === 'true';

        if (buttonHidden) {
            document.querySelectorAll('.' + EP_BTN_CLASS).forEach(btn => btn.remove());
            return;
        }

        const header = document.querySelector('.headerRight');
        if (!header) return;

        injectExtPlayerStyle();

        let btn = header.querySelector('.' + EP_BTN_CLASS);
        if (!btn) btn = createExtPlayerButton();

        // Если есть кнопка уведомлений (плагин NotifySync), всегда стоим сразу после неё справа
        const bell = header.querySelector('#netflix-bell');
        if (bell) {
            if (bell.nextElementSibling !== btn) bell.after(btn);
        } else if (!btn.isConnected) {
            header.prepend(btn);
        }
    }

    function refreshExtPlayerUI() {
        applyExtPlayerModeFlag();
        syncExtPlayerButton();
        document.querySelectorAll('.' + EP_BTN_CLASS).forEach(btn => {
            updateExtPlayerButton(btn);
        });
    }

    function initExtPlayerButton() {
        injectExtPlayerIconStyle();
        applyExtPlayerModeFlag();

        const observer = new MutationObserver(scheduleExtPlayerSync);

        let syncQueued = false;

        function scheduleExtPlayerSync() {
            if (syncQueued) return;
            syncQueued = true;

            requestAnimationFrame(() => {
                syncQueued = false;
                syncExtPlayerButton();
            });
        }

        function startObserver() {
            syncExtPlayerButton();

            observer.observe(document.documentElement, {
                childList: true,
                subtree: true
            });
        }

        if (document.documentElement) {
            startObserver();
        } else {
            document.addEventListener('DOMContentLoaded', startObserver, { once: true });
        }
    }

    function removeErrorWindows() {
        let okButtonList = document.querySelectorAll('button[data-id="ok"]');
        let state = false;
        for (let index = 0; index < okButtonList.length; index++) {
            const element = okButtonList[index];
            if (element.textContent.search(/.+/) != -1) {
                element.click();
                if (isHidden(element)) { continue; }
                state = true;
            }
        }

        let jellyfinSpinner = document.querySelector('div.docspinner');
        if (jellyfinSpinner) {
            jellyfinSpinner.remove();
            state = true;
        };

        return state;
    }

    async function removeErrorWindowsMultiTimes() {
        for (const times of Array(15).keys()) {
            await sleep(200);
            if (removeErrorWindows()) {
                logger.info(`remove error window used time: ${(times + 1) * 0.2}`);
                break;
            };
        }
    }

    function sendDataToLocalServer(data, path) {
        let url = `http://127.0.0.1:58000/${path}/`;
        GM_xmlhttpRequest({
            method: 'POST',
            url: url,
            data: JSON.stringify(data),
            headers: {
                'Content-Type': 'application/json'
            },
            onerror: function (error) {
                alert(`Не удалось связаться с локальной службой:\n${url}\n\nПроверьте, что служба embyToLocalPlayer запущена\nи порт 58000 не занят другой программой.\n\nИнструкция на странице проекта:\nhttps://github.com/VitalityV1nT/embyToLocalPlayer-ru`);
                console.error('Ошибка запроса:', error);
            }
        });
        logger.info(path, data);
    }

    let serverName = null;
    let episodesInfoCache = []; // ['type:[Episodes|NextUp|Items]', resp]
    let episodesInfoRe = /\/Episodes\?IsVirtual|\/NextUp\?Series|\/Items\?ParentId=\w+&Filters=IsNotFolder&Recursive=true/; // Items已排除播放列表
    // 点击位置：Episodes 继续观看，如果是即将观看，可能只有一集的信息 | NextUp 新播放或媒体库播放 | Items 季播放。 只有 Episodes 返回所有集的数据。
    let playlistInfoCache = null;
    let resumeRawInfoCache = null;
    let resumePlaybackCache = {};
    let resumeItemDataCache = {};
    let allPlaybackCache = {};
    let allItemDataCache = {};
    let episodesWithPathCache = {};

    let metadataChangeRe = /\/MetadataEditor|\/Refresh\?/;
    let metadataMayChange = false;

    function cleanOptionalCache() {
        resumeRawInfoCache = null;
        resumePlaybackCache = {};
        resumeItemDataCache = {};
        allPlaybackCache = {};
        allItemDataCache = {};
        episodesInfoCache = [];
        episodesWithPathCache = {};
    }

    function throttle(fn, delay) {
        let lastTime = 0;
        return function (...args) {
            const now = Date.now();
            if (now - lastTime >= delay) {
                lastTime = now;
                fn.apply(this, args);
            }
        };
    }

    let addOpenFolderElement = throttle(_addOpenFolderElement, 100);

    async function _addOpenFolderElement(itemId) {
        if (config.disableOpenFolder) return;
        let mediaSources = null;
        for (const _ of Array(5).keys()) {
            await sleep(500);
            mediaSources = getVisibleElement(document.querySelectorAll('div.mediaSources'));
            if (mediaSources) break;
        }
        if (!mediaSources) return;
        let pathDiv = mediaSources.querySelector('div[class^="sectionTitle sectionTitle-cards"] > div');
        if (!pathDiv || pathDiv.className == 'mediaInfoItems' || pathDiv.id == 'addFileNameElement') return;
        let full_path = pathDiv.textContent;
        if (!full_path.match(/[\\/:]/)) return;
        if (full_path.match(/\d{1,3}\.?\d{0,2} (MB|GB)/)) return;

        let itemData = (itemId in allItemDataCache) ? allItemDataCache[itemId] : null
        let strmFile = (full_path.startsWith('http')) ? itemData?.Path : null

        let openButtonHtml = `<a id="openFolderButton" is="emby-linkbutton" class="raised item-tag-button
        nobackdropfilter emby-button" ><i class="md-icon button-icon button-icon-left">link</i>Open Folder</a>`
        pathDiv.insertAdjacentHTML('beforebegin', openButtonHtml);
        let btn = mediaSources.querySelector('a#openFolderButton');
        if (strmFile) {
            pathDiv.innerHTML = pathDiv.innerHTML + '<br>' + strmFile;
            full_path = strmFile; // emby 会把 strm 内的链接当路径展示
        }
        btn.addEventListener('click', () => {
            logger.info(full_path);
            sendDataToLocalServer({ full_path: full_path }, 'openFolder');
        });
    }

    async function addFileNameElement(resp) {
        let mediaSources = null;
        for (const _ of Array(5).keys()) {
            await sleep(500);
            mediaSources = getVisibleElement(document.querySelectorAll('div.mediaSources'));
            if (mediaSources) break;
        }
        if (!mediaSources) return;
        let pathDivs = mediaSources.querySelectorAll('div[class^="sectionTitle sectionTitle-cards"] > div');
        if (!pathDivs) return;
        pathDivs = Array.from(pathDivs);
        let _pathDiv = pathDivs[0];
        if (_pathDiv.id == 'addFileNameElement') return;
        let isAdmin = !/\d{4}\/\d+\/\d+/.test(_pathDiv.textContent); // 非管理员只有包含添加日期的文件类型 div
        let isStrm = _pathDiv.textContent.startsWith('http');
        if (isAdmin) {
            if (!isStrm) { return; }
            pathDivs = pathDivs.filter((_, index) => index % 2 === 0); // 管理员一个文件同时有路径和文件类型两个 div
        }

        let sources = await resp.clone().json();
        sources = sources.MediaSources;
        for (let index = 0; index < pathDivs.length; index++) {
            const pathDiv = pathDivs[index];
            let fileName = sources[index].Name; // 多版本的话，是版本名。
            let filePath = sources[index].Path;
            let strmFile = filePath.startsWith('http');
            if (!strmFile) {
                fileName = filePath.split('\\').pop().split('/').pop();
                fileName = (config.crackFullPath && !isAdmin) ? filePath : fileName;
            }
            let fileDiv = `<div id="addFileNameElement">${fileName}</div> `
            if (strmFile && (!isAdmin && config.crackFullPath)) {
                fileDiv = `<div id="addFileNameElement">${fileName}<br>${filePath}</div> `
            }
            pathDiv.insertAdjacentHTML('beforebegin', fileDiv);
        }
    }

    function makeItemIdCorrect(itemId) {
        if (serverName !== 'emby') { return itemId; }
        if (!resumeRawInfoCache || !episodesInfoCache) { return itemId; }
        let resumeIds = resumeRawInfoCache.map(item => item.Id);
        if (resumeIds.includes(itemId)) { return itemId; }
        let pageId = window.location.href.match(/\/item\?id=(\d+)/)?.[1];
        if (resumeIds.includes(pageId) && itemId == episodesInfoCache[0].Id) {
            // 解决从继续观看进入集详情页时，并非播放第一集，却请求首集视频文件信息导致无法播放。
            // 手动解决方法：从下方集卡片点击播放，或从集卡片再次进入集详情页后播放。
            // 本函数的副作用：集详情页底部的第一集卡片点播放按钮会播放当前集。
            // 副作用解决办法：再点击一次，或者点第一集卡片进入详情页后再播放。不过一般也不怎么会回头看第一集。
            return pageId;

        } else if (window.location.href.match(/serverId=/)) {
            return itemId; // 仅处理首页继续观看和集详情页，其他页面忽略。
        }
        let correctSeaId = episodesInfoCache.find(item => item.Id == itemId)?.SeasonId;
        let correctItemId = resumeRawInfoCache.find(item => item.SeasonId == correctSeaId)?.Id;
        if (correctSeaId && correctItemId) {
            logger.info(`makeItemIdCorrect, old=${itemId}, new=${correctItemId}`)
            return correctItemId;
        }
        return itemId;
    }

    async function embyToLocalPlayer(playbackUrl, request, playbackData, extraData) {
        let data = {
            ApiClient: ApiClient,
            playbackData: playbackData,
            playbackUrl: playbackUrl,
            request: request,
            mountDiskEnable: localStorage.getItem(etlpStorageKeys.mountDiskEnable),
            extraData: extraData,
            fistTime: fistTime,
        };
        sendDataToLocalServer(data, 'embyToLocalPlayer');
        removeErrorWindowsMultiTimes();
        fistTime = false;
    }

    async function apiClientGetWithCache(itemId, cacheList, funName) {
        if (!itemId) {
            logger.info(`Skip ${funName} ${itemId}`);
        }
        for (const cache of cacheList) {
            if (itemId in cache) {
                logger.info(`HIT ${funName} itemId=${itemId}`)
                return cache[itemId];
            }
        }
        logger.info(`MISS ${funName} itemId=${itemId}`)
        let resInfo;
        switch (funName) {
            case 'getPlaybackInfo':
                resInfo = await ApiClient.getPlaybackInfo(itemId);
                break;
            case 'getItem':
                resInfo = await ApiClient.getItem(ApiClient._serverInfo.UserId, itemId);
                break;
            case 'getEpisodes':
                {
                    let seasonId = itemId;
                    let options = {
                        'Fields': 'MediaSources,Path,ProviderIds',
                        'SeasonId': seasonId,
                    }
                    resInfo = await ApiClient.getEpisodes(seasonId, options);
                    break;
                }
            default:
                break;
        }
        for (const cache of cacheList) {
            if (funName == 'getPlaybackInfo') {
                // strm ffprobe 处理前后的外挂字幕 index 会变化，故不缓存。
                let runtime = resInfo?.MediaSources?.[0]?.RunTimeTicks;
                if (!runtime) break;
            }
            cache[itemId] = resInfo;
        }
        return resInfo;
    }

    async function getPlaybackWithCace(itemId) {
        return apiClientGetWithCache(itemId, [resumePlaybackCache, allPlaybackCache], 'getPlaybackInfo');
    }

    async function getItemInfoWithCace(itemId) {
        return apiClientGetWithCache(itemId, [resumeItemDataCache, allItemDataCache], 'getItem');
    }

    async function getEpisodesWithCace(seasonId) {
        return apiClientGetWithCache(seasonId, [episodesWithPathCache], 'getEpisodes');
    }

    async function dealWithPlaybackInfo(raw_url, url, options) {
        console.time('dealWithPlaybackInfo');
        let rawId = url.match(/\/Items\/(\w+)\/PlaybackInfo/)[1];
        episodesInfoCache = episodesInfoCache[0] ? episodesInfoCache[1].clone() : null;
        let itemId = rawId;
        let [playbackData, mainEpInfo, episodesInfoData] = await Promise.all([
            getPlaybackWithCace(itemId), // originFetch(raw_url, request), 可能会 NoCompatibleStream
            getItemInfoWithCace(itemId),
            episodesInfoCache?.json(),
        ]);
        console.timeEnd('dealWithPlaybackInfo');
        episodesInfoData = (episodesInfoData && episodesInfoData.Items) ? episodesInfoData.Items : null;
        episodesInfoCache = episodesInfoData;
        let correctId = makeItemIdCorrect(itemId);
        url = url.replace(`/${rawId}/`, `/${correctId}/`)
        if (itemId != correctId) {
            itemId = correctId;
            [playbackData, mainEpInfo] = await Promise.all([
                getPlaybackWithCace(itemId),
                getItemInfoWithCace(itemId),
            ]);
            let startPos = mainEpInfo.UserData.PlaybackPositionTicks;
            url = url.replace('StartTimeTicks=0', `StartTimeTicks=${startPos}`);
        }
        let playlistData = (playlistInfoCache && playlistInfoCache.Items) ? playlistInfoCache.Items : null;
        episodesInfoCache = []
        let extraData = {
            mainEpInfo: mainEpInfo,
            episodesInfo: episodesInfoData,
            playlistInfo: playlistData,
            gmInfo: GM_info,
            userAgent: navigator.userAgent,
        }
        playlistInfoCache = null;
        // resumeInfoCache = null;
        logger.info(extraData);
        if (mainEpInfo?.Type == 'Trailer') {
            alert('etlp: Does not support Trailers plugin. Please disable it.');
            return false;
        }
        if (config.disableForLiveTv && mainEpInfo?.Type == 'TvChannel') { return 'disableForLiveTv'; }
        let notBackdrop = Boolean(playbackData.MediaSources[0].Path.search(/\Wbackdrop/i) == -1);
        if (notBackdrop) {
            let _req = options ? options : raw_url;
            playNotifiy();
            embyToLocalPlayer(url, _req, playbackData, extraData);
            return true;
        }
        return false;
    }

    async function deailWithItemInfo(item) {
        let itemId = item.Id;
        let seasonId = item.SeasonId;

        let [mainEpInfo, playbackData, episodesInfoData] = await Promise.all([
            getItemInfoWithCace(itemId),
            getPlaybackWithCace(itemId),
            (seasonId) ? getEpisodesWithCace(seasonId) : null,
        ]);

        let positonTicks = item.UserData.PlaybackPositionTicks;
        let userId = ApiClient._serverInfo.UserId;
        let deviceId = ApiClient._deviceId;
        let accessToken = ApiClient._userAuthInfo?.AccessToken || ApiClient._serverInfo?.AccessToken;
        if (!accessToken) {
            playNotifiy('Not accessToken');
        }
        let urlParams = {
            'X-Emby-Device-Id': deviceId,
            'StartTimeTicks': positonTicks,
            'X-Emby-Token': accessToken,
            'UserId': userId,
            'IsPlayback': true
        };
        let baseUrl = `${window.location.origin}/emby/Items/${itemId}/PlaybackInfo`;
        let searchParams = new URLSearchParams(urlParams);
        let playbackUrl = `${baseUrl}?${searchParams.toString()}`;
        let episodesInfo = episodesInfoData?.Items || [];
        let extraData = {
            mainEpInfo: mainEpInfo,
            episodesInfo: episodesInfo,
            playlistInfo: [],
            gmInfo: GM_info,
            userAgent: navigator.userAgent,
        }
        embyToLocalPlayer(playbackUrl, {}, playbackData, extraData)
    }

    document.addEventListener('click', e => {
        if (localStorage.getItem(etlpStorageKeys.webPlayerEnable) == 'true') { return; }
        // if (window.location.hash != '#!/home') { return; }
        const cardPlayBtn = e.target.closest('button.cardOverlayFab-primary[data-action="play"]');
        // 最新电视和媒体库电视会是 "resume" 需要额外请求 nextup 获取季和集信息。但多版本会只返回一个版本。播放前又要请求多版本信息来确定。
        // const cardPlayBtn = e.target.closest('button.cardOverlayFab-primary[data-action="play"], button.cardOverlayFab-primary[data-action="resume"]');
        // const listPlayBtn = e.target.closest('button.listItem[data-id="resume"][data-action="custom"]');
        // const listShuffleBtn = e.target.closest('button.listItem[data-id="shuffle"][data-action="custom"]');
        const playButton = cardPlayBtn;

        if (!playButton) {
            return;
        }
        const container = e.target.closest('div[is="emby-itemscontainer"]');
        if (!container || (!container._itemSource && !container.items)) {
            logger.info('🎬 Play button clicked, but not within a recognized item list container.');
            return;
        }
        const parentCard = e.target.closest('.virtualScrollItem.card, .backdropCard[data-index]');
        if (!parentCard) {
            return;
        }

        const index = parentCard._dataItemIndex ?? parentCard.dataset.index;
        const itemList = container._itemSource || container.items;
        const item = itemList[index];
        const action = playButton.dataset.action || playButton.dataset.mode;
        let itemType = item.Type;
        if (!['Movie', 'Episode'].includes(itemType)) {
            logger.info('🎬 Play button clicked, but not within legal itemType.');
            return
        }
        logger.info(`🎬 Action '${action}' triggered for item at index ${index}:`, item);
        e.preventDefault();
        e.stopImmediatePropagation();
        deailWithItemInfo(item);
        let title = item.SeriesName || item.Name;
        let subTitle = item.SeriesName && item.Name || item.ProductionYear;
        playNotifiy(title, subTitle);
    }, true);

    async function cacheResumeItemInfo() {
        let inInit = !myBool(resumeRawInfoCache);
        let resumeIds;
        let storageKey = etlpStorageKeys.cacheResumeIds;
        if (inInit) {
            resumeIds = localStorage.getItem(storageKey)
            if (resumeIds) {
                resumeIds = JSON.parse(resumeIds);
            } else {
                return
            }
        } else {
            resumeIds = resumeRawInfoCache.slice(0, 5).map(item => item.Id);
            let seasonIds = resumeRawInfoCache.slice(0, 5).map(item => item.SeasonId);
            await Promise.all(seasonIds.filter(Boolean).map(sid => getEpisodesWithCace(sid)));
            localStorage.setItem(storageKey, JSON.stringify(resumeIds));
        }

        for (let [globalCache, getFun] of [[resumePlaybackCache, getPlaybackWithCace], [resumeItemDataCache, getItemInfoWithCace]]) {
            let cacheDataAcc = {};
            if (myBool(globalCache)) {
                cacheDataAcc = globalCache;
                resumeIds = resumeIds.filter(id => !(id in globalCache));
                if (resumeIds.length == 0) { return; }
            }
            let itemInfoList = await Promise.all(
                resumeIds.map(id => getFun(id))
            )
            // eslint-disable-next-line no-loop-func
            globalCache = itemInfoList.reduce((acc, result, index) => {
                acc[resumeIds[index]] = result;
                return acc;
            }, cacheDataAcc);
        }

    }

    async function cloneAndCacheFetch(resp, key, cache) {
        try {
            const data = await resp.clone().json();
            cache[key] = data;
            return data;
        } catch (_error) {
            // pass
        }
    }

    let itemInfoRe = /\/Items\/(\w+)\?/; // 要严格些，不然手动标记已播放 PlayedItems 也会命中，造成缓存错误数据。

    unsafeWindow.fetch = async (input, options) => {
        let isStrInput = typeof input === 'string';
        let urlStr = isStrInput ? input : input.url;

        if (serverName === null) {
            serverName = typeof ApiClient === 'undefined' ? null : ApiClient._appName.split(' ')[0].toLowerCase();
        } else {
            if (typeof ApiClient != 'undefined' && ApiClient._deviceName != 'embyToLocalPlayer' && localStorage.getItem(etlpStorageKeys.webPlayerEnable) != 'true') {
                ApiClient._deviceName = 'embyToLocalPlayer'
                cacheResumeItemInfo();
            }
        }
        if (metadataMayChange && urlStr.includes('Items')) {
            if (urlStr.includes('reqformat') && !urlStr.includes('fields')) {
                cleanOptionalCache();
                metadataMayChange = false;
                logger.info('cleanOptionalCache by metadataMayChange')
            }
        }
        // 适配播放列表及媒体库的全部播放、随机播放。会禁用版本筛选和美化标题。
        if (urlStr.includes('Items?') && /Limit=(300|1000|5\d\d\d)/.test(urlStr)) {
            let _resp = await originFetch(input, options);
            if (serverName == 'emby') {
                await ApiClient._userViewsPromise?.then(result => {
                    let viewsItems = result.Items;
                    let viewsIds = [];
                    viewsItems.forEach(item => {
                        viewsIds.push(item.Id);
                    });
                    let viewsRegex = viewsIds.join('|');
                    viewsRegex = `ParentId=(${viewsRegex})`
                    if (!RegExp(viewsRegex).test(urlStr)) { // 点击季播放美化标题所需，并非媒体库随机播放。
                        episodesInfoCache = ['Items', _resp.clone()]
                        logger.info('episodesInfoCache', episodesInfoCache);
                        logger.info('viewsRegex', viewsRegex);
                        return _resp;
                    }
                }).catch(error => {
                    console.error('Error occurred: ', error);
                });
            }

            playlistInfoCache = null;
            let _resd = await _resp.clone().json();
            if (!_resd.Items[0]) {
                logger.error('playlist is empty, skip');
                return _resp;
            }
            if (['Movie', 'MusicVideo', 'Episode'].includes(_resd.Items[0].Type)) {
                playlistInfoCache = _resd
                logger.info('playlistInfoCache', playlistInfoCache);
            }
            return _resp
        }
        // 获取各集标题等，仅用于美化标题，放后面避免误拦截首页右键媒体库随机播放数据。
        let _epMatch = urlStr.match(episodesInfoRe);
        if (_epMatch) {
            _epMatch = _epMatch[0].split(['?'])[0].substring(1); // Episodes|NextUp|Items
            let _resp = await originFetch(input, options);
            episodesInfoCache = [_epMatch, _resp.clone()]
            logger.info('episodesInfoCache', episodesInfoCache);
            return _resp
        }

        if (urlStr.includes('Items/Resume') && urlStr.includes('MediaTypes=Video')) {
            let reqUrl = urlStr;

            if (config.enableResumeReorder) {
                reqUrl = urlStr.replace(/Fields=([^&]*)/, 'Fields=$1,DateCreated');
            }

            let fetchInput = isStrInput ? reqUrl : new Request(reqUrl, input);

            let _resp = await originFetch(fetchInput, options);
            let _resd = await _resp.clone().json();

            if (config.enableResumeReorder && _resd.Items && _resd.Items.length > 2) {
                const now = new Date();
                const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
                const firstTwo = _resd.Items.slice(0, 2);
                const rest = _resd.Items.slice(2);
                const recentItems = [];
                const olderItems = [];
                rest.forEach(item => {
                    const dateCreated = new Date(item.DateCreated);
                    if (dateCreated >= threeDaysAgo) {
                        recentItems.push(item);
                    } else {
                        olderItems.push(item);
                    }
                });
                _resd.Items = [...firstTwo, ...recentItems, ...olderItems];
                logger.info(`重排序完成: 前2位保持, ${recentItems.length}个近3天项目前移, ${olderItems.length}个旧项目后移`);
            }

            const modifiedBody = JSON.stringify(_resd);
            const modifiedResponse = new Response(modifiedBody, {
                status: _resp.status,
                statusText: _resp.statusText,
                headers: _resp.headers
            });

            resumeRawInfoCache = _resd.Items;
            cacheResumeItemInfo();
            logger.info('resumeRawInfoCache', resumeRawInfoCache);

            return modifiedResponse;
        }
        // 缓存 itemInfo ，可能匹配到 Items/Resume，故放后面。
        if (urlStr.match(itemInfoRe)) {
            let itemId = urlStr.match(itemInfoRe)[1];
            let resp = await originFetch(input, options);
            logger.info(`CACHE allItemDataCache itemId=${itemId}`);
            cloneAndCacheFetch(resp, itemId, allItemDataCache);
            return resp;
        }
        try {
            if (urlStr.indexOf('/PlaybackInfo?UserId') != -1) {
                if (urlStr.indexOf('IsPlayback=true') != -1 && localStorage.getItem(etlpStorageKeys.webPlayerEnable) != 'true') {
                    let dealRes = await dealWithPlaybackInfo(input, urlStr, options);
                    if (dealRes && dealRes != 'disableForLiveTv') { return; }
                } else {
                    let itemId = urlStr.match(/\/Items\/(\w+)\/PlaybackInfo/)[1];
                    let resp = await originFetch(input, options);
                    addFileNameElement(resp.clone()); // itemId data 不包含多版本的文件信息，故用不到
                    addOpenFolderElement(itemId);
                    logger.info(`CACHE allPlaybackCache itemId=${itemId}`);
                    cloneAndCacheFetch(resp.clone(), itemId, allPlaybackCache);
                    return resp;
                }
            } else if (urlStr.indexOf('/Playing/Stopped') != -1 && localStorage.getItem(etlpStorageKeys.webPlayerEnable) != 'true') {
                return
            }
        } catch (error) {
            logger.error(error, input, urlStr);
            removeErrorWindowsMultiTimes();
            return
        }

        if (urlStr.match(metadataChangeRe)) {
            if (urlStr.includes('MetadataEditor')) {
                metadataMayChange = true;
            } else {
                cleanOptionalCache();
                logger.info('cleanOptionalCache by Refresh')
            }
        }
        return originFetch(input, options);
    }

    function initXMLHttpRequest() {

        const originOpen = XMLHttpRequest.prototype.open;
        const originSend = XMLHttpRequest.prototype.send;
        const originSetHeader = XMLHttpRequest.prototype.setRequestHeader;

        XMLHttpRequest.prototype.setRequestHeader = function (header, value) {
            this._headers[header] = value;
            return originSetHeader.apply(this, arguments);
        }

        XMLHttpRequest.prototype.open = function (method, url) {
            this._method = method;
            this._url = url;
            this._headers = {};

            return originOpen.apply(this, arguments);
        }

        XMLHttpRequest.prototype.send = function (body) {

            let catchJellyfin = (this._method === 'POST' && this._url.endsWith('PlaybackInfo'))
            if (catchJellyfin && localStorage.getItem(etlpStorageKeys.webPlayerEnable) != 'true') { // Jellyfin 10.10
                let pbUrl = this._url;
                body = JSON.parse(body);
                let _body = {};
                ['MediaSourceId', 'StartTimeTicks', 'UserId', 'SubtitleStreamIndex', 'AudioStreamIndex',].forEach(key => {
                    if (body[key] != undefined) {
                        _body[key] = body[key];
                    }
                });
                let query = new URLSearchParams(_body).toString();
                pbUrl = `${pbUrl}?${query}`
                let options = {
                    headers: this._headers,
                };
                dealWithPlaybackInfo(pbUrl, pbUrl, options);
                return;
            }
            originSend.apply(this, arguments);
        }
    }

    initXMLHttpRequest();

    setModeSwitchMenu(etlpStorageKeys.webPlayerEnable, 'Внешний плеер: ', '', 'ВКЛ', 'ВЫКЛ', 'ВКЛ');
    setModeSwitchMenu(etlpStorageKeys.extPlayerButtonHidden, 'Отображение кнопки в шапке: ', '', 'ВКЛ', 'ВЫКЛ', 'ВКЛ');
    setModeSwitchMenu(etlpStorageKeys.extPlayerIconDisabled, 'Заменить значки воспроизведения: ', '', 'ВКЛ', 'ВЫКЛ', 'ВКЛ');
    setModeSwitchMenu(etlpStorageKeys.mountDiskEnable, 'Воспроизведение с жесткого диска: ');

    initExtPlayerButton();
    overwriteConfByStore();

    // Синхронизация состояния между вкладками
    window.addEventListener('storage', e => {
        if (e.key !== null && !Object.values(etlpStorageKeys).includes(e.key)) return;
        registerAllMenus();
        refreshExtPlayerUI();
    });

})();
