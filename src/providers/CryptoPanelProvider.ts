import * as vscode from 'vscode';
import * as path from 'path';
import { WebSocketManager } from '../utils/WebSocketManager';
import { PriceAlertManager } from '../utils/PriceAlertManager';
import { FavoritesManager } from '../utils/FavoritesManager';

export class CryptoPanelProvider implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private webSocketManager: WebSocketManager;
    private disposables: vscode.Disposable[] = [];

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly priceAlertManager: PriceAlertManager,
        private readonly favoritesManager: FavoritesManager,
        private readonly statusBarTicker?: any
    ) {
        this.webSocketManager = new WebSocketManager();
    }

    public createOrShow(): void {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (this.panel) {
            this.panel.reveal(column);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'cryptop',
            'CryptoP - 币圈价格',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.extensionUri, 'media'),
                    vscode.Uri.joinPath(this.extensionUri, 'out')
                ]
            }
        );

        this.panel.webview.html = this.getWebviewContent();

        // 处理来自webview的消息
        this.panel.webview.onDidReceiveMessage(
            (message) => this.handleWebviewMessage(message),
            undefined,
            this.disposables
        );

        this.panel.onDidDispose(
            () => {
                this.panel = undefined;
                this.webSocketManager.disconnect();
            },
            undefined,
            this.disposables
        );

        // 启动WebSocket连接
        this.webSocketManager.connect();
        this.webSocketManager.onPriceUpdate((data) => {
            this.panel?.webview.postMessage({
                type: 'priceUpdate',
                data: data
            });
        });

        // 设置价格提醒检查
        this.webSocketManager.onPriceAlert((symbol, price) => {
            this.priceAlertManager.checkPriceAlerts(symbol, price);
        });
    }

    private async handleWebviewMessage(message: any): Promise<void> {
        switch (message.type) {
            case 'addFavorite':
                if (message.symbol) {
                    await this.favoritesManager.addFavorite(message.symbol);
                    this.panel?.webview.postMessage({
                        type: 'favoriteAdded',
                        symbol: message.symbol
                    });
                }
                break;
            case 'removeFavorite':
                if (message.symbol) {
                    await this.favoritesManager.removeFavorite(message.symbol);
                    this.panel?.webview.postMessage({
                        type: 'favoriteRemoved',
                        symbol: message.symbol
                    });
                }
                break;
            case 'setPriceAlert':
                if (message.symbol && message.price) {
                    await this.priceAlertManager.setPriceAlert(message.symbol, message.price);
                    vscode.window.showInformationMessage(`已设置 ${message.symbol} 价格提醒: ${message.price}`);
                }
                break;
            case 'subscribe':
                if (message.symbol && message.type) {
                    this.webSocketManager.subscribe(message.symbol, message.type);
                }
                break;
            case 'unsubscribe':
                if (message.symbol) {
                    this.webSocketManager.unsubscribe(message.symbol);
                }
                break;
            case 'getFavorites':
                const favorites = await this.favoritesManager.getFavorites();
                this.panel?.webview.postMessage({
                    type: 'favorites',
                    data: favorites
                });
                break;
            case 'getStatusBarConfig':
                if (this.statusBarTicker) {
                    const currentSymbols = this.statusBarTicker.getDisplaySymbols();
                    this.panel?.webview.postMessage({
                        type: 'statusBarConfig',
                        symbols: currentSymbols
                    });
                } else {
                    this.panel?.webview.postMessage({
                        type: 'statusBarConfig',
                        symbols: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT']
                    });
                }
                break;
            case 'setStatusBarSymbols':
                if (message.symbols && Array.isArray(message.symbols)) {
                    if (this.statusBarTicker) {
                        this.statusBarTicker.setDisplaySymbols(message.symbols);

                        // 订阅新的币种
                        message.symbols.forEach((symbol: string) => {
                            this.webSocketManager.subscribe(symbol, 'spot');
                            this.webSocketManager.subscribe(symbol, 'futures');
                        });

                        vscode.window.showInformationMessage(`✅ 状态栏配置已更新: ${message.symbols.join(', ')}`);
                    } else {
                        vscode.window.showInformationMessage(`状态栏配置已更新: ${message.symbols.join(', ')}`);
                    }
                }
                break;
        }
    }

    private getWebviewContent(): string {
        return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CryptoP - 币圈价格</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
            margin: 0;
            padding: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }

        .tab {
            padding: 10px 20px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .tab:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .tab.active {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .content {
            display: none;
        }

        .content.active {
            display: block;
        }

        .favorites-section {
            margin-bottom: 20px;
        }

        .favorites-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }

        .favorites-header h3 {
            margin: 0;
            color: var(--vscode-foreground);
        }

        .manage-favorites-btn {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }

        .manage-favorites-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .add-favorite-form {
            display: flex;
            gap: 10px;
            margin-bottom: 10px;
        }

        .add-favorite-form input {
            flex: 1;
            padding: 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
        }

        .add-favorite-form button {
            padding: 8px 16px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }

        .favorites-display {
            margin-top: 15px;
        }

        .favorites-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 10px;
            margin-top: 10px;
        }

        .favorite-price-card {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 12px;
            position: relative;
            transition: all 0.2s ease;
        }

        .favorite-price-card:hover {
            border-color: var(--vscode-focusBorder);
            transform: translateY(-1px);
        }

        .favorite-price-card .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }

        .favorite-price-card .symbol {
            font-weight: bold;
            color: var(--vscode-foreground);
            font-size: 14px;
        }

        .favorite-price-card .remove-favorite {
            background: none;
            border: none;
            color: var(--vscode-errorForeground);
            cursor: pointer;
            padding: 2px;
            border-radius: 2px;
            opacity: 0.7;
        }

        .favorite-price-card .remove-favorite:hover {
            opacity: 1;
            background: var(--vscode-errorBackground);
        }

        .favorite-price-card .price {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 4px;
        }

        .favorite-price-card .change {
            font-size: 12px;
            font-weight: bold;
        }

        .price-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 15px;
        }

        .price-card {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 16px;
            transition: all 0.2s ease;
            position: relative;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .price-card:hover {
            border-color: var(--vscode-focusBorder);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .price-card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }

        .market-type-badge {
            position: absolute;
            top: 8px;
            right: 8px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 10px;
            font-weight: bold;
        }

        .market-type-badge.spot {
            background: #28a745;
            color: white;
        }

        .market-type-badge.futures {
            background: #ffc107;
            color: #212529;
        }

        .symbol {
            font-size: 18px;
            font-weight: bold;
            color: var(--vscode-symbolIcon-colorForeground);
        }

        .favorite-btn {
            background: none;
            border: none;
            cursor: pointer;
            font-size: 18px;
            color: var(--vscode-button-foreground);
        }

        .favorite-btn.active {
            color: #ffd700;
        }

        .price {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 5px;
        }

        .price.up {
            color: #4caf50;
        }

        .price.down {
            color: #f44336;
        }

        .change {
            font-size: 14px;
            margin-bottom: 10px;
        }

        .change.up {
            color: #4caf50;
        }

        .change.down {
            color: #f44336;
        }

        .alert-section {
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid var(--vscode-panel-border);
        }

        .alert-form {
            display: flex;
            gap: 10px;
        }

        .alert-form input {
            flex: 1;
            padding: 6px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
        }

        .alert-form button {
            padding: 6px 12px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }

        .toast {
            position: fixed;
            top: 20px;
            right: 20px;
            background-color: var(--vscode-notifications-background);
            color: var(--vscode-notifications-foreground);
            padding: 15px;
            border-radius: 4px;
            border: 1px solid var(--vscode-notifications-border);
            z-index: 1000;
            animation: slideIn 0.3s ease-out;
        }

        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }

        .loading {
            text-align: center;
            padding: 20px;
            color: var(--vscode-descriptionForeground);
        }

        /* Settings Styles */
        .settings-container {
            padding: 20px;
            max-width: 800px;
            margin: 0 auto;
        }

        .settings-container h2 {
            color: var(--vscode-foreground);
            margin-bottom: 30px;
            text-align: center;
            font-size: 24px;
        }

        .settings-section {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
        }

        .settings-section h3 {
            color: var(--vscode-foreground);
            margin-bottom: 10px;
            font-size: 18px;
        }

        .settings-section p {
            color: var(--vscode-descriptionForeground);
            margin-bottom: 15px;
        }

        .current-config {
            background: var(--vscode-textBlockQuote-background);
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 15px;
        }

        .preset-configs {
            display: flex;
            gap: 10px;
            margin-bottom: 15px;
            flex-wrap: wrap;
        }

        .preset-btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }

        .preset-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .custom-config {
            display: flex;
            gap: 10px;
            align-items: center;
        }

        .custom-config input {
            flex: 1;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 8px;
            border-radius: 4px;
        }

        .custom-config button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
        }

        .add-favorite {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }

        .add-favorite input {
            flex: 1;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 8px;
            border-radius: 4px;
        }

        .add-favorite button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
        }

        .favorites-list h4 {
            color: var(--vscode-foreground);
            margin-bottom: 10px;
        }

        .favorite-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: var(--vscode-list-hoverBackground);
            padding: 8px 12px;
            margin-bottom: 5px;
            border-radius: 4px;
        }

        .favorite-item .symbol {
            font-weight: bold;
            color: var(--vscode-foreground);
        }

        .favorite-item .remove-btn {
            background: var(--vscode-errorForeground);
            color: white;
            border: none;
            padding: 4px 8px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        }

        .favorite-item .remove-btn:hover {
            opacity: 0.8;
        }

        .display-settings {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .display-settings label {
            display: flex;
            align-items: center;
            gap: 8px;
            color: var(--vscode-foreground);
            cursor: pointer;
        }

        .display-settings input[type="checkbox"] {
            margin: 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>CryptoP - 币圈价格监控</h1>
            <div>
                <button class="tab" onclick="showToast('连接状态良好', 'success')">测试提醒</button>
            </div>
        </div>

        <div class="tabs">
            <button class="tab active" onclick="switchTab('spot')">现货</button>
            <button class="tab" onclick="switchTab('futures')">永续合约</button>
            <button class="tab" onclick="switchTab('settings')">设置</button>
        </div>

        <div class="favorites-section">
            <div class="favorites-header">
                <h3>⭐ 收藏夹</h3>
                <button class="manage-favorites-btn" onclick="switchTab('settings')">管理</button>
            </div>
            <div class="add-favorite-form">
                <input type="text" id="favoriteInput" placeholder="输入币种符号 (例如: BTCUSDT)" />
                <button onclick="addFavorite()">添加收藏</button>
            </div>
            <div class="favorites-display" id="favoritesDisplay">
                <div class="favorites-grid" id="favoritesGrid">
                    <!-- 收藏的币种将在这里显示 -->
                </div>
            </div>
        </div>

        <div id="spot" class="content active">
            <div class="loading">正在连接现货市场...</div>
            <div class="price-grid" id="spotGrid"></div>
        </div>

        <div id="futures" class="content">
            <div class="loading">正在连接永续合约市场...</div>
            <div class="price-grid" id="futuresGrid"></div>
        </div>

        <div id="settings" class="content">
            <div class="settings-container">
                <h2>⚙️ 设置中心</h2>

                <!-- 状态栏配置 -->
                <div class="settings-section">
                    <h3>📊 状态栏显示配置</h3>
                    <p>选择在底部状态栏显示的币种价格</p>
                    <div class="status-bar-config">
                        <div class="current-config">
                            <strong>当前显示：</strong>
                            <span id="currentStatusBarSymbols">加载中...</span>
                        </div>
                        <div class="preset-configs">
                            <button class="preset-btn" onclick="setStatusBarPreset(['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT'])">
                                📊 推荐配置
                            </button>
                            <button class="preset-btn" onclick="setStatusBarPreset(['BTCUSDT', 'ETHUSDT', 'DOGEUSDT', 'SHIBUSDT', 'PEPEUSDT'])">
                                🔥 热门配置
                            </button>
                            <button class="preset-btn" onclick="setStatusBarPreset(['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOTUSDT'])">
                                💎 主流配置
                            </button>
                        </div>
                        <div class="custom-config">
                            <input type="text" id="customStatusBarInput" placeholder="自定义币种，用逗号分隔 (例如: BTCUSDT, ETHUSDT)" />
                            <button onclick="setCustomStatusBar()">应用自定义配置</button>
                        </div>
                    </div>
                </div>

                <!-- 收藏管理 -->
                <div class="settings-section">
                    <h3>⭐ 收藏管理</h3>
                    <p>管理你的收藏币种</p>
                    <div class="favorites-management">
                        <div class="add-favorite">
                            <input type="text" id="newFavoriteInput" placeholder="添加新收藏 (例如: DOGEUSDT)" />
                            <button onclick="addNewFavorite()">添加收藏</button>
                        </div>
                        <div class="favorites-list">
                            <h4>已收藏的币种：</h4>
                            <div id="favoritesList">加载中...</div>
                        </div>
                    </div>
                </div>

                <!-- 显示设置 -->
                <div class="settings-section">
                    <h3>🎨 显示设置</h3>
                    <p>自定义界面显示选项</p>
                    <div class="display-settings">
                        <label>
                            <input type="checkbox" id="showPercentChange" checked> 显示百分比变化
                        </label>
                        <label>
                            <input type="checkbox" id="showVolume" checked> 显示交易量
                        </label>
                        <label>
                            <input type="checkbox" id="autoRefresh" checked> 自动刷新价格
                        </label>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        let currentTab = 'spot';
        let favorites = [];
        let priceData = {};

        // 初始化
        window.addEventListener('load', () => {
            vscode.postMessage({ type: 'getFavorites' });

            // 订阅默认币种
            const defaultSymbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT'];
            defaultSymbols.forEach(symbol => {
                vscode.postMessage({ type: 'subscribe', symbol: symbol, type: 'spot' });
                vscode.postMessage({ type: 'subscribe', symbol: symbol, type: 'futures' });
            });

            // 隐藏加载提示，显示网格
            setTimeout(() => {
                document.querySelectorAll('.loading').forEach(el => el.style.display = 'none');
            }, 2000);
        });

        // 监听来自extension的消息
        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.type) {
                case 'priceUpdate':
                    updatePrice(message.data);
                    break;
                case 'favorites':
                    favorites = message.data;
                    updateFavoriteButtons();
                    updateFavoritesList();
                    break;
                case 'favoriteAdded':
                    favorites.push(message.symbol);
                    updateFavoriteButtons();
                    updateFavoritesList();
                    vscode.postMessage({ type: 'subscribe', symbol: message.symbol, type: 'spot' });
                    vscode.postMessage({ type: 'subscribe', symbol: message.symbol, type: 'futures' });
                    break;
                case 'favoriteRemoved':
                    favorites = favorites.filter(f => f !== message.symbol);
                    updateFavoriteButtons();
                    updateFavoritesList();
                    break;
                case 'statusBarConfig':
                    updateCurrentStatusBarDisplay(message.symbols);
                    break;
            }
        });

        function switchTab(tab) {
            currentTab = tab;

            // 更新tab按钮
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            event.target.classList.add('active');

            // 更新内容
            document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));
            document.getElementById(tab).classList.add('active');

            // 如果切换到设置页面，加载设置数据
            if (tab === 'settings') {
                loadSettingsData();
            }
        }

        function addFavorite() {
            const input = document.getElementById('favoriteInput');
            const symbol = input.value.trim().toUpperCase();

            if (symbol && !favorites.includes(symbol)) {
                vscode.postMessage({ type: 'addFavorite', symbol: symbol });
                input.value = '';
                showToast(\`已添加 \${symbol} 到收藏夹\`, 'success');
            }
        }

        function removeFavorite(symbol) {
            vscode.postMessage({ type: 'removeFavorite', symbol: symbol });
            showToast(\`已从收藏夹移除 \${symbol}\`, 'info');
        }

        function setPriceAlert(symbol) {
            const price = prompt(\`请输入 \${symbol} 的目标价格:\`);
            if (price && !isNaN(price) && parseFloat(price) > 0) {
                vscode.postMessage({
                    type: 'setPriceAlert',
                    symbol: symbol,
                    price: parseFloat(price)
                });
            }
        }

        function updatePrice(data) {
            priceData[data.symbol] = data;

            const spotGrid = document.getElementById('spotGrid');
            const futuresGrid = document.getElementById('futuresGrid');

            // 清空loading
            if (spotGrid.querySelector('.loading')) {
                spotGrid.innerHTML = '';
            }
            if (futuresGrid.querySelector('.loading')) {
                futuresGrid.innerHTML = '';
            }

            // 更新价格卡片
            updatePriceCard(data, data.type === 'spot' ? spotGrid : futuresGrid);
        }

        function updatePriceCard(data, container) {
            let card = container.querySelector(\`[data-symbol="\${data.symbol}"]\`);

            if (!card) {
                card = createPriceCard(data);
                container.appendChild(card);
            } else {
                updateExistingCard(card, data);
            }
        }

        function createPriceCard(data) {
            const card = document.createElement('div');
            card.className = 'price-card';
            card.setAttribute('data-symbol', data.symbol);

            const isFavorite = favorites.includes(data.symbol);
            const priceClass = data.priceChange >= 0 ? 'up' : 'down';
            const changeClass = data.priceChange >= 0 ? 'up' : 'down';
            const changePrefix = data.priceChange >= 0 ? '+' : '';

            // 获取波动率图标
            const volatilityIcon = getVolatilityIcon(data.priceChange);

            card.innerHTML = \`
                <div class="market-type-badge \${data.type}">\${data.type === 'spot' ? '现货' : '期货'}</div>
                <div class="price-card-header">
                    <span class="symbol">\${volatilityIcon} \${data.symbol}</span>
                    <button class="favorite-btn \${isFavorite ? 'active' : ''}" onclick="toggleFavorite('\${data.symbol}')">
                        ⭐
                    </button>
                </div>
                <div class="price \${priceClass}">\${data.price}</div>
                <div class="change \${changeClass}">\${changePrefix}\${data.priceChange.toFixed(2)}%</div>
                <div class="alert-section">
                    <div class="alert-form">
                        <input type="number" placeholder="目标价格" id="alert-\${data.symbol}-\${data.type}" />
                        <button onclick="setPriceAlert('\${data.symbol}')">设置提醒</button>
                    </div>
                </div>
            \`;

            return card;
        }

        function getVolatilityIcon(priceChange) {
            const absChange = Math.abs(priceChange);
            if (absChange >= 5) {
                return priceChange >= 0 ? '🚀' : '🔥';
            } else if (absChange >= 2) {
                return priceChange >= 0 ? '📈' : '📉';
            } else if (absChange >= 0.1) {
                return priceChange >= 0 ? '↗' : '↘';
            } else {
                return '➡';
            }
        }

        function updateExistingCard(card, data) {
            const priceElement = card.querySelector('.price');
            const changeElement = card.querySelector('.change');

            const priceClass = data.priceChange >= 0 ? 'up' : 'down';
            const changeClass = data.priceChange >= 0 ? 'up' : 'down';
            const changePrefix = data.priceChange >= 0 ? '+' : '';

            priceElement.textContent = data.price;
            priceElement.className = \`price \${priceClass}\`;

            changeElement.textContent = \`\${changePrefix}\${data.priceChange.toFixed(2)}%\`;
            changeElement.className = \`change \${changeClass}\`;
        }

        function toggleFavorite(symbol) {
            if (favorites.includes(symbol)) {
                removeFavorite(symbol);
            } else {
                vscode.postMessage({ type: 'addFavorite', symbol: symbol });
            }
        }

        function updateFavoriteButtons() {
            document.querySelectorAll('.favorite-btn').forEach(btn => {
                const symbol = btn.closest('.price-card').getAttribute('data-symbol');
                if (favorites.includes(symbol)) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });

            // 更新收藏夹展示区域
            updateFavoritesDisplay();
        }

        function updateFavoritesDisplay() {
            const favoritesGrid = document.getElementById('favoritesGrid');
            if (!favoritesGrid) return;

            if (favorites.length === 0) {
                favoritesGrid.innerHTML = '<p style="text-align: center; color: var(--vscode-descriptionForeground); padding: 20px;">暂无收藏币种，点击上方添加或在价格卡片上点击⭐</p>';
                return;
            }

            // 为每个收藏的币种创建价格卡片
            favoritesGrid.innerHTML = favorites.map(symbol => {
                const spotData = priceData[symbol + '-spot'];
                const futuresData = priceData[symbol + '-futures'];

                if (!spotData && !futuresData) {
                    return \`
                        <div class="favorite-price-card">
                            <div class="card-header">
                                <span class="symbol">\${symbol}</span>
                                <button class="remove-favorite" onclick="removeFavorite('\${symbol}')" title="移除收藏">✕</button>
                            </div>
                            <div class="price" style="color: var(--vscode-descriptionForeground);">加载中...</div>
                            <div class="change">--</div>
                        </div>
                    \`;
                }

                const data = spotData || futuresData;
                const priceClass = data.priceChange >= 0 ? 'up' : 'down';
                const changePrefix = data.priceChange >= 0 ? '+' : '';

                return \`
                    <div class="favorite-price-card">
                        <div class="card-header">
                            <span class="symbol">\${symbol}</span>
                            <button class="remove-favorite" onclick="removeFavorite('\${symbol}')" title="移除收藏">✕</button>
                        </div>
                        <div class="price \${priceClass}">\${data.price}</div>
                        <div class="change \${priceClass}">\${changePrefix}\${data.priceChange.toFixed(2)}%</div>
                        <div style="font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 4px;">
                            \${data.type === 'spot' ? '现货' : '期货'}
                        </div>
                    </div>
                \`;
            }).join('');
        }

        function showToast(message, type = 'info') {
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.textContent = message;

            document.body.appendChild(toast);

            setTimeout(() => {
                toast.remove();
            }, 3000);
        }

        // 处理输入框回车事件
        document.getElementById('favoriteInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                addFavorite();
            }
        });

        // Settings Functions
        function loadSettingsData() {
            // 请求当前状态栏配置
            vscode.postMessage({ type: 'getStatusBarConfig' });
            // 请求收藏列表
            vscode.postMessage({ type: 'getFavorites' });
        }

        function setStatusBarPreset(symbols) {
            vscode.postMessage({
                type: 'setStatusBarSymbols',
                symbols: symbols
            });
            updateCurrentStatusBarDisplay(symbols);
            showToast(\`状态栏配置已更新: \${symbols.join(', ')}\`, 'success');
        }

        function setCustomStatusBar() {
            const input = document.getElementById('customStatusBarInput');
            const value = input.value.trim();
            if (value) {
                const symbols = value.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length > 0);
                if (symbols.length > 0) {
                    vscode.postMessage({
                        type: 'setStatusBarSymbols',
                        symbols: symbols
                    });
                    updateCurrentStatusBarDisplay(symbols);
                    input.value = '';
                    showToast(\`状态栏配置已更新: \${symbols.join(', ')}\`, 'success');
                } else {
                    showToast('请输入有效的币种符号', 'error');
                }
            }
        }

        function updateCurrentStatusBarDisplay(symbols) {
            const element = document.getElementById('currentStatusBarSymbols');
            if (element) {
                element.textContent = symbols.join(', ');
            }
        }

        function addNewFavorite() {
            const input = document.getElementById('newFavoriteInput');
            const symbol = input.value.trim().toUpperCase();
            if (symbol && !favorites.includes(symbol)) {
                vscode.postMessage({ type: 'addFavorite', symbol: symbol });
                input.value = '';
                showToast(\`已添加 \${symbol} 到收藏夹\`, 'success');
            } else if (favorites.includes(symbol)) {
                showToast(\`\${symbol} 已在收藏夹中\`, 'info');
            }
        }

        function removeFavoriteFromSettings(symbol) {
            vscode.postMessage({ type: 'removeFavorite', symbol: symbol });
            showToast(\`已从收藏夹移除 \${symbol}\`, 'info');
        }

        function updateFavoritesList() {
            const container = document.getElementById('favoritesList');
            if (!container) return;

            if (favorites.length === 0) {
                container.innerHTML = '<p style="color: var(--vscode-descriptionForeground);">暂无收藏币种</p>';
                return;
            }

            container.innerHTML = favorites.map(symbol => \`
                <div class="favorite-item">
                    <span class="symbol">\${symbol}</span>
                    <button class="remove-btn" onclick="removeFavoriteFromSettings('\${symbol}')">移除</button>
                </div>
            \`).join('');
        }

        // 处理设置页面的输入框回车事件
        document.addEventListener('DOMContentLoaded', function() {
            const customInput = document.getElementById('customStatusBarInput');
            const favoriteInput = document.getElementById('newFavoriteInput');

            if (customInput) {
                customInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        setCustomStatusBar();
                    }
                });
            }

            if (favoriteInput) {
                favoriteInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        addNewFavorite();
                    }
                });
            }
        });
    </script>
</body>
</html>
        `;
    }

    public dispose(): void {
        if (this.panel) {
            this.panel.dispose();
        }

        this.webSocketManager.dispose();

        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}