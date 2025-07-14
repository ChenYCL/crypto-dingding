import * as vscode from 'vscode';
import { CryptoPanelProvider } from './providers/CryptoPanelProvider';
import { CryptoPriceTreeProvider } from './providers/CryptoPriceTreeProvider';
import { PriceAlertManager } from './utils/PriceAlertManager';
import { FavoritesManager } from './utils/FavoritesManager';
import { StatusBarTicker } from './utils/StatusBarTicker';
import { WebSocketManager } from './utils/WebSocketManager';

export async function activate(context: vscode.ExtensionContext) {
    console.log('CryptoP 插件已激活');

    // 初始化管理器
    const priceAlertManager = new PriceAlertManager(context);
    const favoritesManager = new FavoritesManager(context);
    const webSocketManager = new WebSocketManager();

    // 初始化状态栏滚动显示
    const statusBarTicker = new StatusBarTicker(context);

    // 初始化侧边栏价格树视图
    const priceTreeProvider = new CryptoPriceTreeProvider(favoritesManager);

    // 创建面板提供者
    const cryptoPanelProvider = new CryptoPanelProvider(context.extensionUri, priceAlertManager, favoritesManager, statusBarTicker);

    // 设置收藏变化回调，让面板能通知侧边栏更新
    cryptoPanelProvider.setFavoritesChangeCallback(() => {
        priceTreeProvider.refresh();
    });

    // 注册树视图
    vscode.window.registerTreeDataProvider('cryptop.priceTreeView', priceTreeProvider);

    // 连接WebSocket数据到各个组件
    webSocketManager.onPriceUpdate((data) => {
        console.log(`Price update received: ${data.symbol} - ${data.price} (${data.priceChange}%)`);

        // Update status bar ticker
        statusBarTicker.updatePrice(data);

        // Update sidebar tree view
        priceTreeProvider.updatePrice(data);

        // Note: Panel provider handles its own WebSocket connection
    });

    // 连接价格提醒
    webSocketManager.onPriceAlert((symbol, price) => {
        priceAlertManager.checkPriceAlerts(symbol, price);
    });

    // 启动WebSocket连接
    webSocketManager.connect();

    // 订阅常用币种 - 更多主流币种
    const defaultSymbols = [
        'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT',
        'DOGEUSDT', 'XRPUSDT', 'LINKUSDT', 'MATICUSDT', 'AVAXUSDT',
        'DOTUSDT', 'UNIUSDT', 'LTCUSDT', 'BCHUSDT', 'FILUSDT'
    ];

    // 获取用户收藏的币种
    const userFavorites = await favoritesManager.getFavorites();
    const allSymbols = [...new Set([...defaultSymbols, ...userFavorites])];

    allSymbols.forEach(symbol => {
        webSocketManager.subscribe(symbol, 'spot');
        webSocketManager.subscribe(symbol, 'futures');
    });

    // 注册命令
    const openPanelCommand = vscode.commands.registerCommand('cryptop.openPanel', () => {
        cryptoPanelProvider.createOrShow();
    });

    const refreshPricesCommand = vscode.commands.registerCommand('cryptop.refreshPrices', () => {
        priceTreeProvider.refresh();
        vscode.window.showInformationMessage('Crypto prices refreshed!');
    });

    const configureStatusBarCommand = vscode.commands.registerCommand('cryptop.configureStatusBar', async () => {
        const currentSymbols = statusBarTicker.getDisplaySymbols();

        // 显示当前配置
        const currentConfig = `当前状态栏显示: ${currentSymbols.join(', ')}`;

        const options = [
            '🔧 自定义配置',
            '📊 推荐配置 (BTC, ETH, BNB, SOL, ADA)',
            '🔥 热门配置 (BTC, ETH, DOGE, SHIB, PEPE)',
            '💎 主流配置 (BTC, ETH, BNB, XRP, ADA, DOT)',
            '📈 查看当前配置'
        ];

        const selected = await vscode.window.showQuickPick(options, {
            placeHolder: currentConfig,
            title: '配置状态栏显示的币种'
        });

        let symbols: string[] = [];

        switch (selected) {
            case '🔧 自定义配置':
                const input = await vscode.window.showInputBox({
                    prompt: '输入要显示的币种 (用逗号分隔)',
                    value: currentSymbols.join(', '),
                    placeHolder: '例如: BTCUSDT, ETHUSDT, BNBUSDT, DOGEUSDT'
                });
                if (input) {
                    symbols = input.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length > 0);
                }
                break;
            case '📊 推荐配置 (BTC, ETH, BNB, SOL, ADA)':
                symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT'];
                break;
            case '🔥 热门配置 (BTC, ETH, DOGE, SHIB, PEPE)':
                symbols = ['BTCUSDT', 'ETHUSDT', 'DOGEUSDT', 'SHIBUSDT', 'PEPEUSDT'];
                break;
            case '💎 主流配置 (BTC, ETH, BNB, XRP, ADA, DOT)':
                symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOTUSDT'];
                break;
            case '📈 查看当前配置':
                vscode.window.showInformationMessage(`当前状态栏显示币种: ${currentSymbols.join(', ')}`);
                return;
        }

        if (symbols.length > 0) {
            statusBarTicker.setDisplaySymbols(symbols);

            // 订阅新的币种
            symbols.forEach(symbol => {
                webSocketManager.subscribe(symbol, 'spot');
                webSocketManager.subscribe(symbol, 'futures');
            });

            vscode.window.showInformationMessage(`✅ 状态栏显示币种已更新: ${symbols.join(', ')}`);
        }
    });

    const addFavoriteCommand = vscode.commands.registerCommand('cryptop.addFavorite', async () => {
        const symbol = await vscode.window.showInputBox({
            placeHolder: '请输入币种符号 (例如: BTCUSDT)',
            prompt: '添加到收藏夹'
        });

        if (symbol) {
            await favoritesManager.addFavorite(symbol.toUpperCase());

            // 订阅新的币种
            webSocketManager.subscribe(symbol.toUpperCase(), 'spot');
            webSocketManager.subscribe(symbol.toUpperCase(), 'futures');

            // 更新树视图
            await priceTreeProvider.updateFavorites();

            vscode.window.showInformationMessage(`${symbol} 已添加到收藏夹`);
        }
    });

    const setPriceAlertCommand = vscode.commands.registerCommand('cryptop.setPriceAlert', async () => {
        const symbol = await vscode.window.showInputBox({
            placeHolder: '请输入币种符号 (例如: BTCUSDT)',
            prompt: '设置价格提醒'
        });

        if (!symbol) return;

        const price = await vscode.window.showInputBox({
            placeHolder: '请输入目标价格',
            prompt: `设置 ${symbol} 的价格提醒`,
            validateInput: (value: string) => {
                const num = parseFloat(value);
                return isNaN(num) || num <= 0 ? '请输入有效的价格' : null;
            }
        });

        if (price) {
            await priceAlertManager.setPriceAlert(symbol.toUpperCase(), parseFloat(price));
            vscode.window.showInformationMessage(`已设置 ${symbol} 价格提醒: ${price}`);
        }
    });

    // 注册所有命令和组件
    context.subscriptions.push(
        openPanelCommand,
        refreshPricesCommand,
        configureStatusBarCommand,
        addFavoriteCommand,
        setPriceAlertCommand,
        cryptoPanelProvider,
        statusBarTicker,
        webSocketManager
    );

    // 不自动打开面板，让用户手动打开
}

export function deactivate() {
    console.log('CryptoP 插件已停用');
} 